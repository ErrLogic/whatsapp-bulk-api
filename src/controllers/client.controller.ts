import type {Response} from 'express';
import { PrismaClient } from '@prisma/client';
import type {AuthenticatedRequest, ApiResponse} from '../types';
import { whatsappService } from '../services/whatsapp.service';

const prisma = new PrismaClient();

export class ClientController {
    async registerClient(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { clientPhone, clientName } = req.body;
            const userId = req.user!.id;

            const existingClient = await prisma.client.findFirst({
                where: { userId, clientPhone },
            });

            if (existingClient) {
                res.status(400).json({
                    success: false,
                    message: 'WhatsApp client already registered for this phone number',
                });
                return;
            }

            const client = await prisma.client.create({
                data: {
                    userId,
                    clientPhone,
                    clientName: clientName || clientPhone,
                    clientPath: ''
                },
            });

            const updatedClient = await prisma.client.update({
                where: { id: client.id },
                data: {
                    clientPath: `./whatsapp-sessions/${client.id}`,
                },
            });

            await whatsappService.createClient(client.id, clientPhone);

            res.status(201).json({
                success: true,
                message: 'WhatsApp client registered successfully. Please scan the QR code.',
                data: updatedClient,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to register WhatsApp client',
            });
        }
    }


    async getClients(req: AuthenticatedRequest, res: Response) {
        try {
            const userId = req.user!.id;

            const clients = await prisma.client.findMany({
                where: { userId },
                select: {
                    id: true,
                    clientPhone: true,
                    clientName: true,
                    isQrScanned: true,
                    isWhatsappAuthenticated: true,
                    isWhatsappReady: true,
                    lastSeen: true,
                    createdAt: true,
                },
            });

            const response: ApiResponse = {
                success: true,
                message: 'Clients retrieved successfully',
                data: clients,
            };

            res.json(response);
        } catch (error: any) {
            const response: ApiResponse = {
                success: false,
                message: error.message || 'Failed to retrieve clients',
            };

            res.status(500).json(response);
        }
    }

    async getQRCode(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { clientId } = req.params;
            const userId = req.user!.id;

            const client = await prisma.client.findFirst({
                where: { id: clientId, userId },
            });

            if (!client) {
                res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
                return;
            }

            const qrCode = whatsappService.getClientQRCode(clientId);

            if (!qrCode) {
                res.status(400).json({
                    success: false,
                    message: 'QR code not available. Client may already be authenticated.',
                });
                return;
            }

            res.json({
                success: true,
                message: 'QR code retrieved successfully',
                data: { qrCode },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve QR code',
            });
        }
    }

    async deleteClient(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { clientId } = req.params;
            const userId = req.user!.id;

            const client = await prisma.client.findFirst({
                where: { id: clientId, userId },
            });

            if (!client) {
                res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
                return;
            }

            await whatsappService.destroyClient(clientId);

            await prisma.client.delete({
                where: { id: clientId },
            });

            res.json({
                success: true,
                message: 'Client deleted successfully',
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to delete client',
            });
        }
    }

}