import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { CrmModule } from './modules/crm/crm.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { HealthModule } from './modules/health/health.module';
import { PeopleModule } from './modules/people/people.module';
import { ServiceModule } from './modules/service/service.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { AutomationModule } from './modules/automation/automation.module';
import { TransitionModule } from './modules/transition/transition.module';
import { RecordsModule } from './modules/records/records.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { StripTenantOverrideInterceptor } from './common/interceptors/strip-tenant-override.interceptor';
import { CorrelationMiddleware } from './common/middleware/correlation.middleware';
import { useBullmq } from './runtime';

@Module({})
export class AppModule implements NestModule {
  static forRoot(): DynamicModule {
    const bullmq = useBullmq();
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
        ...(bullmq
          ? [
              BullModule.forRootAsync({
                inject: [ConfigService],
                useFactory: (config: ConfigService) => ({
                  connection: (() => {
                    const url = new URL(config.get<string>('REDIS_URL', 'redis://localhost:6379'));
                    return {
                      host: url.hostname,
                      port: Number(url.port || 6379),
                      password: url.password || undefined,
                    };
                  })(),
                  prefix: 'refurbicon',
                }),
              }),
              RedisModule,
            ]
          : []),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        PrismaModule,
        CommonModule,
        AuthModule,
        TenantsModule,
        OrganizationModule,
        NotificationsModule.forRoot(bullmq),
        TasksModule,
        CrmModule,
        InventoryModule,
        SalesModule,
        AccountsModule,
        PeopleModule,
        ServiceModule,
        DispatchModule,
        AutomationModule,
        TransitionModule,
        RecordsModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
        { provide: APP_INTERCEPTOR, useClass: StripTenantOverrideInterceptor },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
