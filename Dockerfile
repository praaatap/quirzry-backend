# to build the app and generate the Prisma client.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Copy the Prisma schema. This is crucial for 'prisma generate'.
# We copy it before 'npm ci' so post-install scripts can run.
# IMPORTANT: This assumes your schema is at 'prisma/schema.prisma'
COPY prisma/ ./prisma/

# Install all dependencies (including devDependencies for 'prisma')
RUN npm ci

# Generate the Prisma Client
RUN npx prisma generate

# Copy the rest of your application source code
COPY src/ ./src/
COPY serviceAccountKey.json ./

# Prune devDependencies to keep node_modules clean
RUN npm prune --production

# --- Stage 2: Production ---
# This is the final, clean image for production.
FROM node:20-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy the 'package.json' (needed by some hosts, good practice)
COPY --from=builder /app/package*.json ./

# Copy the pruned 'node_modules' from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the application code
COPY --from=builder /app/src ./src

# Copy the service account key
COPY --from=builder /app/serviceAccountKey.json ./

# Expose the port the app runs on
EXPOSE 3000

# The command to start the application.
# Using 'node' directly is cleaner than 'npm start' for signal handling.
CMD ["node", "src/index.js"]