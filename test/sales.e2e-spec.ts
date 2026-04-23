import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Chance } from 'chance';

const chance = new Chance();

describe('SalesController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const user = {
    email: chance.email(),
    password: 'Password123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Signup and Login to get token
    await request(app.getHttpServer()).post('/auth/signup').send(user);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send(user);
    accessToken = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/sales/import-wintour (POST) - Success', () => {
    const payload = {
      nr_arquivo: `ACC-E2E-${chance.guid()}`,
      data_geracao: '2023-01-01',
      hora_geracao: '10:00',
      nome_agencia: 'LZT E2E',
      versao_xml: 5,
      tickets: [
        {
          num_bilhete: 'BILL-E2E-001',
          localizador: 'LOCE2E',
          passageiro: 'JOHN DOE',
        },
      ],
    };

    return request(app.getHttpServer())
      .post('/sales/import-wintour')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);
  });

  it('/sales/import-wintour (POST) - Unauthorized', () => {
    return request(app.getHttpServer())
      .post('/sales/import-wintour')
      .send({})
      .expect(401);
  });
});
