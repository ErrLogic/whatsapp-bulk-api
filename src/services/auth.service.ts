import {PrismaClient} from '@prisma/client';
import {comparePassword, hashPassword} from '../utils/password.util';
import {generateToken} from '../utils/jwt.util';

const prisma = new PrismaClient();

export class AuthService {
    async register(userData: {
        name: string;
        email: string;
        phone: string;
        password: string;
    }) {
        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: userData.email },
                    { phone: userData.phone }
                ]
            }
        });

        if (existingUser) {
            throw new Error('User already exists with this email or phone');
        }

        // Hash password
        const hashedPassword = await hashPassword(userData.password);

        // Create user
        return prisma.user.create({
            data: {
                ...userData,
                password: hashedPassword,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
                createdAt: true,
            },
        });
    }

    async login(phone: string, password: string) {
        // Find user
        const user = await prisma.user.findUnique({
            where: { phone },
        });

        if (!user || !user.isActive) {
            throw new Error('Invalid credentials or` account is inactive');
        }

        // Check password
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid credentials');
        }

        // Generate token
        const token = generateToken({
            id: user.id,
            email: user.email,
            phone: user.phone,
            name: user.name,
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
            },
        };
    }
}