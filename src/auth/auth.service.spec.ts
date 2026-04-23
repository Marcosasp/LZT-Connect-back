import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'nestjs-prisma';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPasswordService = {
    hashPassword: jest.fn(),
    validatePassword: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
    decode: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({ expiresIn: '1h' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PasswordService, useValue: mockPasswordService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const signupData = { email: 'test@test.com', password: 'password' };
      mockPasswordService.hashPassword.mockResolvedValue('hashed-password');
      mockPrismaService.user.create.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
      });

      const result = await service.createUser(signupData as any);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if prisma throws P2002', async () => {
      const signupData = { email: 'test@test.com', password: 'password' };
      mockPrismaService.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Conflict', {
          code: 'P2002',
          clientVersion: 'mock',
        }),
      );

      await expect(service.createUser(signupData as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        password: 'hashed-password',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPasswordService.validatePassword.mockResolvedValue(true);

      const result = await service.login('test@test.com', 'password');

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('notfound@test.com', 'password'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if password invalid', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        password: 'hashed-password',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPasswordService.validatePassword.mockResolvedValue(false);

      await expect(service.login('test@test.com', 'password')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
