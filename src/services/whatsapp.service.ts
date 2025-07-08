import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import fs from 'fs-extra';
import path from 'path';
import type {WhatsAppClient} from '../types';

const prisma = new PrismaClient();

class WhatsAppService {
    private clients: Map<string, WhatsAppClient> = new Map();
    private readonly sessionPath: string;
    private readonly qrCodePath: string;

    constructor() {
        this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp-sessions';
        this.qrCodePath = process.env.QR_CODE_PATH || './uploads/qr-codes';

        // Ensure directories exist
        fs.ensureDirSync(this.sessionPath);
        fs.ensureDirSync(this.qrCodePath);
    }

    async createClient(clientId: string, clientPhone: string): Promise<WhatsAppClient> {
        return new Promise((resolve, reject) => {
            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: clientId,
                    dataPath: this.sessionPath,
                }),
                puppeteer: {
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                },
            });

            const clientEntry: WhatsAppClient = {
                id: clientId,
                client,
                isReady: false,
                phone: clientPhone
            };

            this.clients.set(clientId, clientEntry);

            // QR code generation
            client.on('qr', async (qr) => {
                console.log(`QR Code generated for client ${clientId}`);
                const qrCodePath = path.join(this.qrCodePath, `${clientId}.png`);
                await QRCode.toFile(qrCodePath, qr);

                await prisma.client.update({
                    where: { id: clientId },
                    data: {
                        clientQrPath: qrCodePath,
                        isQrScanned: false
                    },
                });

                clientEntry.qrCode = qr;
            });

            client.on('authenticated', async () => {
                console.log(`Client ${clientId} authenticated`);
                await prisma.client.update({
                    where: { id: clientId },
                    data: {
                        isQrScanned: true,
                        isWhatsappAuthenticated: true
                    },
                });
            });

            client.on('ready', async () => {
                console.log(`Client ${clientId} is ready`);
                await prisma.client.update({
                    where: { id: clientId },
                    data: {
                        isWhatsappReady: true,
                        lastSeen: new Date()
                    },
                });

                clientEntry.isReady = true;
                resolve(clientEntry); // Resolve the promise when ready
            });

            client.on('disconnected', async (reason) => {
                console.log(`Client ${clientId} disconnected: ${reason}`);
                await prisma.client.update({
                    where: { id: clientId },
                    data: {
                        isWhatsappReady: false,
                        isWhatsappAuthenticated: false
                    },
                });

                this.clients.delete(clientId);
                reject(new Error(`Client ${clientId} disconnected`));
            });

            client.on('auth_failure', () => {
                reject(new Error(`Authentication failed for client ${clientId}`));
            });

            client.initialize().catch(reject);
        });
    }

    async waitUntilClientReady(clientId: string, timeout = 30000): Promise<void> {
        const interval = 500;
        const maxTries = timeout / interval;
        let tries = 0;

        console.log(`⏳ Waiting for client ${clientId} to become ready...`);

        return new Promise((resolve, reject) => {
            const check = () => {
                const client = this.clients.get(clientId);
                console.log(`🔍 [check ${tries + 1}] client:`, client?.isReady);
                if (client?.isReady) {
                    console.log(`✅ Client ${clientId} is ready!`);
                    return resolve();
                }
                tries++;
                if (tries > maxTries) {
                    return reject(new Error(`Timeout waiting for client ${clientId} to be ready`));
                }
                setTimeout(check, interval);
            };
            check();
        });
    }

    async resurrectReadyClients(): Promise<void> {
        console.log('🔁 Resurrecting WhatsApp clients from database...');

        const clients = await prisma.client.findMany({
            where: { isWhatsappReady: true },
            select: {
                id: true,
                clientPhone: true,
            },
        });

        for (const client of clients) {
            try {
                console.log(`♻️ Restoring client ${client.id}`);
                await this.createClient(client.id, client.clientPhone);
            } catch (err) {
                console.error(`❌ Failed to restore client ${client.id}:`, err);
            }
        }

        console.log(`✅ Restored ${clients.length} client(s)`);
    }

    async sendMessage(clientId: string, phone: string, message: string): Promise<boolean> {
        console.log('Sending message via clientId:', clientId);
        const whatsappClient = this.clients.get(clientId);

        if (!whatsappClient || !whatsappClient.isReady) {
            throw new Error('WhatsApp client not ready');
        }

        try {
            const formattedPhone = phone.includes('@') ? phone : `${phone}@c.us`;
            await whatsappClient.client.sendMessage(formattedPhone, message);
            return true;
        } catch (error) {
            console.error(`Failed to send message to ${phone}:`, error);
            return false;
        }
    }

    async sendMediaMessage(clientId: string, phone: string, filePath: string, caption?: string): Promise<boolean> {
        console.log(`📎 Sending media via clientId: ${clientId}`);
        const whatsappClient = this.clients.get(clientId);

        if (!whatsappClient || !whatsappClient.isReady) {
            throw new Error('WhatsApp client not ready');
        }

        try {
            const formattedPhone = phone.includes('@') ? phone : `${phone}@c.us`;
            const media = MessageMedia.fromFilePath(filePath);
            await whatsappClient.client.sendMessage(formattedPhone, media, {
                caption: caption || '',
            });
            return true;
        } catch (error) {
            console.error(`Failed to send media message to ${phone}:`, error);
            return false;
        }
    }

    getClientQRCode(clientId: string | undefined): string | null {
        if (!clientId) return null;

        const client = this.clients.get(clientId);
        return client?.qrCode || null;
    }

    async destroyClient(clientId: string | undefined): Promise<void> {
        if (clientId != null) {
            const whatsappClient = this.clients.get(clientId);
            if (whatsappClient) {
                await whatsappClient.client.destroy();
                this.clients.delete(clientId);
            }
        }
    }
}

export const whatsappService = new WhatsAppService();