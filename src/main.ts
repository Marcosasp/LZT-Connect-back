import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClientExceptionFilter } from 'nestjs-prisma';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filterException/http-exception.filter';
import type {
  CorsConfig,
  NestConfig,
  SwaggerConfig,
} from './common/configs/config.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true, // Ignora campos que não estão no DTO
      forbidNonWhitelisted: true, // Retorna erro se enviarem campos extras
    }),
  );
  // Validation
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // enable shutdown hook
  app.enableShutdownHooks();

  // Global exception filters
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new PrismaClientExceptionFilter(httpAdapter as any),
    new HttpExceptionFilter(),
  );

  const configService = app.get(ConfigService);
  const nestConfig = configService.get<NestConfig>('nest');
  const corsConfig = configService.get<CorsConfig>('cors');
  const swaggerConfig = configService.get<SwaggerConfig>('swagger');

  // Swagger Api
  if (swaggerConfig.enabled) {
    const options = new DocumentBuilder()
      .setTitle(swaggerConfig.title || 'LZT Connect API')
      .setDescription(swaggerConfig.description || 'API de Integração LZT')
      .setVersion(swaggerConfig.version || '1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, options);

    SwaggerModule.setup(swaggerConfig.path || 'api', app, document);
  }

  // Cors
  if (corsConfig.enabled) {
    app.enableCors({
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://192.168.1.163:3001',
        'http://192.168.1.163:3000',
      ],
      credentials: true,
    });
  }

  await app.listen(process.env.PORT || nestConfig.port || 3000, '0.0.0.0');
}
bootstrap();
