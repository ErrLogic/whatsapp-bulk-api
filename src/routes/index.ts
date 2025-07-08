import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { ClientController } from '../controllers/client.controller';
import { ContactController, uploadCsv } from '../controllers/contact.controller';
import { MessageController, uploadMedia } from '../controllers/message.controller';
import { ProcessController } from '../controllers/process.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
    validateRequest,
    registerSchema,
    loginSchema,
    clientSchema,
    messageSchema
} from '../utils/validation.util';

const router = Router();

// --- Auth Routes ---
const authController = new AuthController();
const authRouter = Router();

authRouter.post('/register', validateRequest(registerSchema), authController.register);
authRouter.post('/login', validateRequest(loginSchema), authController.login);

router.use('/auth', authRouter);

// --- Client Routes (Protected) ---
const clientController = new ClientController();
const clientsRouter = Router();

clientsRouter.use(authenticateToken);
clientsRouter.post('/', validateRequest(clientSchema), clientController.registerClient);
clientsRouter.get('/', clientController.getClients);
clientsRouter.get('/:clientId/qr', clientController.getQRCode);
clientsRouter.delete('/:clientId', clientController.deleteClient);

router.use('/clients', clientsRouter);

// --- Contact Routes (Protected) ---
const contactController = new ContactController();
const contactsRouter = Router();

contactsRouter.use(authenticateToken);
contactsRouter.post('/upload', uploadCsv.single('file'), contactController.uploadContacts);
contactsRouter.post('/', contactController.addContact);
contactsRouter.get('/', contactController.getContacts);
contactsRouter.delete('/:contactId', contactController.deleteContact);

router.use('/contacts', contactsRouter);

// --- Message Routes (Protected) ---
const messageController = new MessageController();
const messagesRouter = Router();

messagesRouter.use(authenticateToken);
messagesRouter.post('/bulk/message', validateRequest(messageSchema), messageController.sendBulkMessage);
messagesRouter.post('/bulk/message-media', uploadMedia.single('file'), messageController.sendBulkMedia);
messagesRouter.get('/:processId', messageController.getMessages);

router.use('/messages', messagesRouter);

// --- Process Routes (Protected) ---
const processController = new ProcessController();
const processesRouter = Router();

processesRouter.use(authenticateToken);
processesRouter.get('/', processController.getProcesses);
processesRouter.get('/:processId/status', processController.getProcessStatus);
processesRouter.get('/queue/status', processController.getQueueStatus);

router.use('/processes', processesRouter);

export default router;
