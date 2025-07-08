import type {Request} from 'express';

export interface AuthenticatedRequest extends Omit<Request, 'setEncoding' | 'pause' | 'resume' | 'unpipe' | 'wrap'> {
    user?: {
        id: string;
        email: string;
        phone: string;
        name: string;
    };
}

export interface WhatsAppClient {
    id: string;
    client: any;
    isReady: boolean;
    qrCode?: string;
    phone: string;
}

export interface BulkMessageJob {
    processId: string;
    userId: string;
    clientId: string;
    contactIds: string[];
    message: string;
    mediaPath?: string;
}

export interface ContactData {
    name: string;
    phone: string;
}

export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    errors?: string[];
}