import type {Response} from 'express';
import {Prisma, PrismaClient} from '@prisma/client';
import type {AuthenticatedRequest} from '../types';
import { queueService } from '../services/queue.service';

const prisma = new PrismaClient();

export class ProcessController {
    async getProcesses(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const userId = req.user!.id;
            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);
            const skip = (page - 1) * limit;

            const findManyArgs: Prisma.ProcessFindManyArgs = {
                where: { userId },
                include: {
                    client: {
                        select: {
                            clientName: true,
                            clientPhone: true,
                        },
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            };

            const [processes, total] = await Promise.all([
                prisma.process.findMany(findManyArgs),
                prisma.process.count({ where: { userId } }),
            ]);

            res.status(200).json({
                success: true,
                message: 'Processes retrieved successfully',
                data: {
                    processes,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                        hasNextPage: page * limit < total,
                    },
                },
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Failed to retrieve processes';

            res.status(500).json({
                success: false,
                message: errorMessage,
            });
        }
    }

    async getProcessStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const { processId } = req.params;
            const userId = req.user!.id;

            const process = await prisma.process.findFirst({
                where: {
                    id: processId,
                    userId,
                },
                include: {
                    client: {
                        select: {
                            clientName: true,
                            clientPhone: true,
                        },
                    },
                },
            });

            if (!process) {
                res.status(404).json({
                    success: false,
                    message: 'Process queue not found',
                });
                return;
            }

            const messageStats = await prisma.message.groupBy({
                by: ['status'],
                where: { processId },
                _count: { _all: true },
            });

            // Default statuses
            type MessageStatus = 'pending' | 'sent' | 'failed';
            const stats: Record<MessageStatus, number> = {
                pending: 0,
                sent: 0,
                failed: 0,
            };

            messageStats.forEach(stat => {
                if (stat.status && stat.status in stats) {
                    stats[stat.status as MessageStatus] = stat._count._all || 0;
                }
            });

            const totalContacts = process.totalContact || 0;
            const sentCount = process.sentCount || 0;
            const percentage = totalContacts > 0
                ? Math.round((sentCount / totalContacts) * 100)
                : 0;

            res.status(200).json({
                success: true,
                message: 'Process status retrieved successfully',
                data: {
                    process,
                    messageStats: stats,
                    progress: {
                        total: totalContacts,
                        sent: sentCount,
                        remaining: Math.max(0, totalContacts - sentCount),
                        percentage,
                    },
                },
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Failed to retrieve process status';

            res.status(500).json({
                success: false,
                message: errorMessage,
            });
        }
    }

    async getQueueStatus(_req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            const queueLength = await queueService.getQueueLength('bulk-message');

            res.json({
                success: true,
                message: 'Queue status retrieved successfully',
                data: {
                    queueLength,
                    status: queueLength > 0 ? 'active' : 'idle',
                },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve queue status',
            });
        }
    }
}