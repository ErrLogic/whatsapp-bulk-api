import { createClient } from 'redis';
import type {BulkMessageJob} from '../types';

class QueueService {
    private client: any;
    private isConnected: boolean = false;

    constructor() {
        this.client = createClient({
            socket: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
            },
            password: process.env.REDIS_PASSWORD || undefined,
        });

        this.client.on('error', (err: any) => console.error('Redis Client Error', err));
        this.client.on('connect', () => {
            this.isConnected = true;
            console.log('Redis client connected');
        });
    }

    async connect() {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }

    async addJob(queueName: string, jobData: BulkMessageJob) {
        await this.connect();
        await this.client.lPush(queueName, JSON.stringify(jobData));
    }

    async getJob(queueName: string): Promise<BulkMessageJob | null> {
        await this.connect();
        const jobData = await this.client.brPop(queueName, 0);
        return jobData ? JSON.parse(jobData.element) : null;
    }

    async getQueueLength(queueName: string): Promise<number> {
        await this.connect();
        return await this.client.lLen(queueName);
    }
}

export const queueService = new QueueService();