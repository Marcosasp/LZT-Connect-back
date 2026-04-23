import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Chance } from 'chance';
import { PrismaService } from 'nestjs-prisma';
import { Role } from '@prisma/client';

const chance = new Chance();

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const user = {
    email: chance.email(),
    password: 'Password123!',
    firstname: chance.first(),
    lastname: chance.last(),
    birthday: '01/01/1990',
    phone: '11999999999',
    street: 'Rua das Flores, 123',
    city: 'São Paulo',
    state: 'SP',
    zip_code: '01234-567',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    const prisma = app.get(PrismaService);

    // Signup and Login to get token
    await request(app.getHttpServer()).post('/auth/signup').send(user);

    // Manual grant ADMIN role to test user
    await prisma.user.update({
      where: { email: user.email.toLowerCase() },
      data: { role: Role.ADMIN },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send(user);
    accessToken = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('/users/me (GET) - Success', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(user.email.toLowerCase());
        expect(res.body).not.toHaveProperty('password');
      });
  });

  it('/users/me (GET) - Unauthorized', () => {
    return request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('/users (PATCH) - Update Profile', () => {
    return request(app.getHttpServer())
      .patch('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstname: 'UpdatedName' })
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toBe('Usuário alterado com Sucesso!');
      });
  });

  it('/users (PATCH) - Error - Invalid Role (e.g. AGENT)', () => {
    return request(app.getHttpServer())
      .patch('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        role: 'AGENT',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain(
          'O cargo deve ser um valor válido (ADMIN ou USER)',
        );
      });
  });

  it('/users/role (PATCH) - Error - Invalid Role (e.g. AGENT)', () => {
    return request(app.getHttpServer())
      .patch('/users/role')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        user_id: 'some-uuid',
        role: 'AGENT',
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toContain(
          'O cargo deve ser um valor válido (ADMIN ou USER)',
        );
      });
  });

  it('/users/role (PATCH) - Error - User Not Found', () => {
    return request(app.getHttpServer())
      .patch('/users/role')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        user_id: 'non-existent-id',
        role: Role.USER,
      })
      .expect(404)
      .expect((res) => {
        expect(res.body.message).toBe('Usuário não encontrado');
      });
  });

  it('/users/change-password (PATCH) - Success', () => {
    return request(app.getHttpServer())
      .patch('/users/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        old_password: user.password,
        new_password: 'NewStrongPassword123!',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toBe('Senha alterada com Sucesso!');
      });
  });

  it('/users/role (PATCH) - Forbidden (Not Admin)', async () => {
    const prisma = app.get(PrismaService);
    // Demote user to USER
    await prisma.user.update({
      where: { email: user.email.toLowerCase() },
      data: { role: Role.USER },
    });

    return request(app.getHttpServer())
      .patch('/users/role')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        user_id: 'some-id',
        role: Role.ADMIN,
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.message).toBe(
          'Você não tem acesso para realizar essa ação',
        );
      });
  });
});
