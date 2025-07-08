import type {Response} from 'express';
import {Prisma, PrismaClient} from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import type {AuthenticatedRequest} from '../types';
import { CSVService } from '../services/csv.service';

const prisma = new PrismaClient();
const csvService = new CSVService();

const csvStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = process.env.CSV_PATH || './uploads/csv';
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

export const uploadCsv = multer({
    storage: csvStorage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB
    },
    fileFilter: (_req, file, cb) => {
        const validMimeTypes = [
            'text/csv',
            'application/vnd.ms-excel', // For older Excel CSV
            'text/plain' // Some CSVs may report this
        ];

        const validExt = ['.csv'].includes(
            path.extname(file.originalname).toLowerCase()
        );

        if (validMimeTypes.includes(file.mimetype) || validExt) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

export class ContactController {
    async uploadContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const file = req.file;

            if (!file) {
                res.status(400).json({
                    success: false,
                    message: 'No CSV file uploaded',
                });
                return;
            }

            const contacts = await csvService.parseCSV(file.path);

            if (contacts.length === 0) {
                await fs.remove(file.path);
                res.status(400).json({
                    success: false,
                    message: 'No valid contacts found in CSV file',
                });
                return;
            }

            const savedContacts = await prisma.contact.createMany({
                data: contacts.map(contact => ({
                    userId,
                    contactName: contact.name,
                    phone: contact.phone,
                })),
                skipDuplicates: true,
            });

            await fs.remove(file.path);

            res.json({
                success: true,
                message: `${savedContacts.count} contacts uploaded successfully`,
                data: {
                    totalProcessed: contacts.length,
                    totalSaved: savedContacts.count,
                },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to upload contacts',
            });
        }
    }

    async getContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
            const skip = (page - 1) * limit;

            const findManyArgs: Prisma.ContactFindManyArgs = {
                where: { userId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    contactName: true,
                    phone: true,
                    createdAt: true,
                },
            };

            const [contacts, total] = await Promise.all([
                prisma.contact.findMany(findManyArgs),
                prisma.contact.count({ where: { userId } }),
            ]);

            res.status(200).json({
                success: true,
                message: 'Contacts retrieved successfully',
                data: {
                    contacts,
                    pagination: {
                        page,
                        limit,
                        total,
                        hasNextPage: (page * limit) < total,
                        totalPages: Math.ceil(total / limit),
                    },
                },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve contacts',
            });
        }
    }

    async deleteContact(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { contactId } = req.params;
            const userId = req.user!.id;

            const contact = await prisma.contact.findFirst({
                where: {
                    id: contactId,
                    userId,
                },
            });

            if (!contact) {
                res.status(404).json({
                    success: false,
                    message: 'Contact not found',
                });
                return;
            }

            await prisma.contact.delete({
                where: { id: contactId },
            });

            res.json({
                success: true,
                message: 'Contact deleted successfully',
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to delete contact',
            });
        }
    }

    async addContact(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { contactName, phone } = req.body;
            const userId = req.user!.id;

            // Check if contact already exists
            const existing = await prisma.contact.findFirst({
                where: {
                    userId,
                    phone
                }
            });

            if (existing) {
                res.status(400).json({
                    success: false,
                    message: 'Contact with this phone number already exists.',
                });

                return;
            }

            const contact = await prisma.contact.create({
                data: {
                    userId,
                    contactName,
                    phone,
                },
            });

            res.status(201).json({
                success: true,
                message: 'Contact added successfully',
                data: contact,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to add contact',
            });
        }
    }
}