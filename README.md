# WhatsApp Bulk API

To install dependencies:

```bash
bun install
```

Setup ```.env```
```bash
# Database
DATABASE_URL="mysql://username:password@host:port/db_name"

# JWT
JWT_SECRET="your-secret-jwt"
JWT_EXPIRES_IN="7d"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD=""

# Server
PORT=3000
NODE_ENV="development"

# WhatsApp
WHATSAPP_SESSION_PATH="./whatsapp-sessions"
QR_CODE_PATH="./uploads/qr-codes"
MEDIA_PATH="./uploads/media"
CSV_PATH="./uploads/csv"

# File Upload 5MB
MAX_FILE_SIZE=5242880
```

Setup Prisma

```bash
bun run db:migrate
bun run db:generate
```

To run:

```bash
bun run dev:full
```

This project was created using `bun init` in bun v1.2.17. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
