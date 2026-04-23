import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from 'nestjs-prisma';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockUsersService = {
    createUser: jest.fn(),
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
        { provide: UsersService, useValue: mockUsersService },
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
      mockUsersService.createUser.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
      });

      const result = await service.createUser(signupData as any);

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(mockUsersService.createUser).toHaveBeenCalledWith({
        ...signupData,
        password: 'hashed-password',
      });
    });

    it('should throw ConflictException if usersService throws P2002', async () => {
      const signupData = { email: 'test@test.com', password: 'password' };
      mockPasswordService.hashPassword.mockResolvedValue('hashed-password');
      mockUsersService.createUser.mockRejectedValue(
        new ConflictException('O e-mail test@test.com ja esta em uso.'),
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

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('notfound@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password invalid', async () => {
      const user = {
        id: '1',
        email: 'test@test.com',
        password: 'hashed-password',
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPasswordService.validatePassword.mockResolvedValue(false);

      await expect(service.login('test@test.com', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
