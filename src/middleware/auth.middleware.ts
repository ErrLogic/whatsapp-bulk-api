import type {NextFunction, Response} from 'express';
import {verifyToken} from '../utils/jwt.util';
import type {AuthenticatedRequest} from '../types';

export const authenticateToken = (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): void => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({
            success: false,
            message: 'Access token required',
        });
        return;
    }

    try {
        req.user = verifyToken(token);
        next();
    } catch (error) {
        res.status(403).json({
            success: false,
            message: 'Invalid or expired token',
        });
    }
};