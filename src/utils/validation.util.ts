import Joi from 'joi';

export const registerSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).min(10).max(20).required(),
    password: Joi.string().min(6).required(),
});

export const loginSchema = Joi.object({
    phone: Joi.string().pattern(/^[0-9+\-\s()]+$/).min(10).max(20).required(),
    password: Joi.string().min(6).required(),
});

export const clientSchema = Joi.object({
    clientPhone: Joi.string().pattern(/^[0-9+\-\s()]+$/).min(10).max(20).required(),
    clientName: Joi.string().min(2).max(100).optional(),
});

export const messageSchema = Joi.object({
    clientId: Joi.string().uuid().required(),
    message: Joi.string().min(1).max(4000).required(),
});

export const validateRequest = (schema: Joi.Schema) => {
    return (req: any, res: any, next: any) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message),
            });
        }
        next();
    };
};