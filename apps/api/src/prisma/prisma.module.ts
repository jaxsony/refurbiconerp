import { Global, Module } from '@nestjs/common';
import { PrismaService, createPrismaClient } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async () => {
        const client = createPrismaClient();
        if (!process.env.VERCEL) {
          await client.$connect();
        }
        return client;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
