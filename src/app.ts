import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import type {ApiResponse} from './types';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
}));

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// API routes
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
    const response: ApiResponse = {
        success: true,
        message: 'Server is running',
        data: {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
    };
    res.json(response);
});

// 404 handler
app.use((_req, res) => {
    const response: ApiResponse = {
        success: false,
        message: 'Route not found',
    };
    res.status(404).json(response);
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response) => {
    console.error('Error:', err);

    const response: ApiResponse = {
        success: false,
        message: err.message || 'Internal server error',
    };

    res.status(err.status || 500).json(response);
});

export default app;