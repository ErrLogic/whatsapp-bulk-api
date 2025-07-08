import type {Request, Response} from 'express';
import { AuthService } from '../services/auth.service';
import type {ApiResponse} from '../types';

const authService = new AuthService();

export class AuthController {
    async register(req: Request, res: Response) {
        try {
            const { name, email, phone, password } = req.body;

            const user = await authService.register({
                name,
                email,
                phone,
                password,
            });

            const response: ApiResponse = {
                success: true,
                message: 'User registered successfully',
                data: user,
            };

            res.status(201).json(response);
        } catch (error: any) {
            const response: ApiResponse = {
                success: false,
                message: error.message || 'Registration failed',
            };

            res.status(400).json(response);
        }
    }

    async login(req: Request, res: Response) {
        try {
            const { phone, password } = req.body;

            const result = await authService.login(phone, password);

            const response: ApiResponse = {
                success: true,
                message: 'Login successful',
                data: result,
            };

            res.json(response);
        } catch (error: any) {
            const response: ApiResponse = {
                success: false,
                message: error.message || 'Login failed',
            };

            res.status(401).json(response);
        }
    }
}