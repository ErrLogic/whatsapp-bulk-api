import type {Response} from 'express';
import {Prisma, PrismaClient} from '@prisma/client';
import type {AuthenticatedRequest, BulkMessageJob} from '../types';
import { queueService } from '../services/queue.service';
import fs from "fs-extra";
import multer from "multer";

const prisma = new PrismaClient();

const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = process.env.MEDIA_PATH || './uploads/media';
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

export const uploadMedia = multer({
    storage: mediaStorage,
    limits: {
        fileSize: parseInt(process.env.MAX_MEDIA_FILE_SIZE || '10485760'), // default 10MB
    },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'text/csv',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'video/mp4',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    }
});

export class MessageController {
    async sendBulkMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { clientId, message } = req.body;
            const userId = req.user!.id;

            const client = await prisma.client.findFirst({
                where: {
                    id: clientId,
                    userId,
                    isWhatsappReady: true,
                },
            });

            if (!client) {
                res.status(400).json({
                    success: false,
                    message: 'WhatsApp client not found or not ready',
                });
                return;
            }

            const contacts = await prisma.contact.findMany({
                where: { userId },
                select: { id: true },
            });

            if (contacts.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'No contacts found. Please upload contacts first.',
                });
                return;
            }

            const process = await prisma.process.create({
                data: {
                    userId,
                    clientId,
                    totalContact: contacts.length,
                    messageText: message,
                    status: 'pending',
                },
            });

            await prisma.message.createMany({
                data: contacts.map(contact => ({
                    processId: process.id,
                    contactId: contact.id,
                    message,
                })),
            });

            const job: BulkMessageJob = {
                processId: process.id,
                userId,
                clientId,
                contactIds: contacts.map(c => c.id),
                message,
            };

            await queueService.addJob('bulk-message', job);

            res.json({
                success: true,
                message: 'Bulk message job queued successfully',
                data: {
                    processId: process.id,
                    totalContacts: contacts.length,
                    status: 'queued',
                },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to queue bulk message',
            });
        }
    }

    async getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const { processId } = req.params;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
            const skip = (page - 1) * limit;

            const process = await prisma.process.findFirst({
                where: { id: processId, userId },
                select: { id: true },
            });

            if (!process) {
                res.status(404).json({
                    success: false,
                    message: 'Process not found',
                });
                return;
            }

            const findManyArgs: Prisma.MessageFindManyArgs = {
                where: { processId },
                include: {
                    contact: {
                        select: {
                            contactName: true,
                            phone: true,
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            };

            const [messages, total] = await Promise.all([
                prisma.message.findMany(findManyArgs),
                prisma.message.count({ where: { processId } }),
            ]);

            res.status(200).json({
                success: true,
                message: 'Messages retrieved successfully',
                data: {
                    messages,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                        hasNextPage: (page * limit) < total,
                    },
                },
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve messages';

            res.status(500).json({
                success: false,
                message: errorMessage,
            });
        }
    }

    async sendBulkMedia(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { clientId, caption } = req.body;
            const file = req.file;
            const userId = req.user!.id;

            console.log('File object:', req);

            if (!file) {
                res.status(400).json({ success: false, message: 'No media file uploaded' });
                return;
            }

            const client = await prisma.client.findFirst({
                where: {
                    id: clientId,
                    userId,
                    isWhatsappReady: true,
                },
            });

            if (!client) {
                await fs.remove(file.path);
                res.status(400).json({
                    success: false,
                    message: 'WhatsApp client not found or not ready',
                });
                return;
            }

            const contacts = await prisma.contact.findMany({
                where: { userId },
                select: { id: true },
            });

            if (contacts.length === 0) {
                await fs.remove(file.path);
                res.status(400).json({
                    success: false,
                    message: 'No contacts found. Please upload contacts first.',
                });
                return;
            }

            const mediaPath = file.path;

            const process = await prisma.process.create({
                data: {
                    userId,
                    clientId,
                    totalContact: contacts.length,
                    messageText: caption || '[Media Message]',
                    status: 'pending',
                    mediaPath: mediaPath,
                },
            });

            await prisma.message.createMany({
                data: contacts.map(contact => ({
                    processId: process.id,
                    contactId: contact.id,
                    message: caption || '',
                    mediaPath: mediaPath,
                })),
            });

            const job: BulkMessageJob = {
                processId: process.id,
                userId,
                clientId,
                contactIds: contacts.map(c => c.id),
                message: caption || '',
                mediaPath: mediaPath,
            };

            await queueService.addJob('bulk-message', job);

            res.json({
                success: true,
                message: 'Bulk media message job queued successfully',
                data: {
                    processId: process.id,
                    totalContacts: contacts.length,
                    status: 'queued',
                },
            });
        } catch (error: any) {
            if (req.file?.path) await fs.remove(req.file.path);

            res.status(500).json({
                success: false,
                message: error.message || 'Failed to queue bulk media message',
            });
        }
    }
}