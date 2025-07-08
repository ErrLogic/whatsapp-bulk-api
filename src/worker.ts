import { PrismaClient } from '@prisma/client';
import { queueService } from './services/queue.service';
import { whatsappService } from './services/whatsapp.service';
import type {BulkMessageJob} from './types';
import fs from "fs-extra";

const prisma = new PrismaClient();

class MessageWorker {
    private isProcessing = false;
    private isRunning = true;

    async start() {
        console.log('🔄 Message worker started');
        await whatsappService.resurrectReadyClients();

        while (this.isRunning) {
            try {
                if (!this.isProcessing) {
                    await this.processQueue();
                }

                // Wait 5 seconds before checking queue again
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error('Worker error:', error);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    private async processQueue() {
        this.isProcessing = true;

        try {
            const job = await queueService.getJob('bulk-message');

            if (job) {
                console.log(`📨 Processing job for process ${job.processId}`);
                await this.processJob(job);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    // private async processJob(job: BulkMessageJob) {
    //     const { processId, userId, clientId, contactIds, message } = job;
    //
    //     try {
    //         // Update process status
    //         await prisma.process.update({
    //             where: { id: processId },
    //             data: { status: 'processing' },
    //         });
    //
    //         // Get contacts with their details
    //         const contacts = await prisma.contact.findMany({
    //             where: {
    //                 id: { in: contactIds },
    //                 userId,
    //             },
    //         });
    //
    //         let sentCount = 0;
    //
    //         await whatsappService.waitUntilClientReady(clientId);
    //
    //         for (const contact of contacts) {
    //             try {
    //                 // Send message
    //                 const success = await whatsappService.sendMessage(
    //                     clientId,
    //                     contact.phone,
    //                     message
    //                 );
    //
    //                 // Update message status
    //                 await prisma.message.updateMany({
    //                     where: {
    //                         processId,
    //                         contactId: contact.id,
    //                     },
    //                     data: {
    //                         status: success ? 'sent' : 'failed',
    //                         sentAt: success ? new Date() : null,
    //                     },
    //                 });
    //
    //                 if (success) {
    //                     sentCount++;
    //                 }
    //
    //                 // Add delay between messages to avoid rate limiting
    //                 await new Promise(resolve => setTimeout(resolve, 2000));
    //
    //             } catch (error) {
    //                 console.error(`Failed to send message to ${contact.phone}:`, error);
    //
    //                 await prisma.message.updateMany({
    //                     where: {
    //                         processId,
    //                         contactId: contact.id,
    //                     },
    //                     data: { status: 'failed' },
    //                 });
    //             }
    //         }
    //
    //         // Update process completion
    //         await prisma.process.update({
    //             where: { id: processId },
    //             data: {
    //                 status: 'completed',
    //                 sentCount,
    //             },
    //         });
    //
    //         console.log(`✅ Job completed: ${sentCount}/${contacts.length} messages sent`);
    //
    //     } catch (error) {
    //         console.error(`❌ Job failed for process ${processId}:`, error);
    //
    //         await prisma.process.update({
    //             where: { id: processId },
    //             data: { status: 'failed' },
    //         });
    //     }
    // }

    private async processJob(job: BulkMessageJob) {
        const { processId, userId, clientId, contactIds, message, mediaPath } = job;

        try {
            // Update process status
            await prisma.process.update({
                where: { id: processId },
                data: { status: 'processing' },
            });

            // Get contacts with their details
            const contacts = await prisma.contact.findMany({
                where: {
                    id: { in: contactIds },
                    userId,
                },
            });

            let sentCount = 0;

            await whatsappService.waitUntilClientReady(clientId);

            for (const contact of contacts) {
                try {
                    let success: boolean;

                    if (mediaPath) {
                        // Send media message
                        success = await whatsappService.sendMediaMessage(
                            clientId,
                            contact.phone,
                            mediaPath,
                            message
                        );
                    } else {
                        // Send text message
                        success = await whatsappService.sendMessage(
                            clientId,
                            contact.phone,
                            message
                        );
                    }

                    // Update message status
                    await prisma.message.updateMany({
                        where: {
                            processId,
                            contactId: contact.id,
                        },
                        data: {
                            status: success ? 'sent' : 'failed',
                            sentAt: success ? new Date() : null,
                        },
                    });

                    if (success) {
                        sentCount++;
                    }

                    // Add delay between messages to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    console.error(`Failed to send message to ${contact.phone}:`, error);

                    await prisma.message.updateMany({
                        where: {
                            processId,
                            contactId: contact.id,
                        },
                        data: { status: 'failed' },
                    });
                }
            }

            // Clean up media file after sending
            if (mediaPath) {
                try {
                    await fs.remove(mediaPath);
                } catch (error) {
                    console.error('Failed to clean up media file:', error);
                }
            }

            // Update process completion
            await prisma.process.update({
                where: { id: processId },
                data: {
                    status: 'completed',
                    sentCount,
                },
            });

            console.log(`✅ Job completed: ${sentCount}/${contacts.length} messages sent`);

        } catch (error) {
            console.error(`❌ Job failed for process ${processId}:`, error);

            await prisma.process.update({
                where: { id: processId },
                data: { status: 'failed' },
            });

            // Clean up media file if job fails
            if (mediaPath) {
                try {
                    await fs.remove(mediaPath);
                } catch (error) {
                    console.error('Failed to clean up media file:', error);
                }
            }
        }
    }
}

// Start worker
const worker = new MessageWorker();
worker.start().catch(console.error);