import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from 'nestjs-prisma';
import { PasswordService } from '../auth/password.service';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockPasswordService = {
    hashPassword: jest.fn(),
    validatePassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PasswordService, useValue: mockPasswordService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    passwordService = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const updateData = { firstname: 'New' };
      mockPrismaService.user.update.mockResolvedValue({
        id: '1',
        ...updateData,
      });

      const result = await service.updateUser('1', updateData as any);

      expect(result.firstname).toBe('New');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('createManagedUser', () => {
    it('should create managed user successfully', async () => {
      mockPasswordService.hashPassword.mockResolvedValue('hashed-password');
      mockPrismaService.user.create = jest.fn().mockResolvedValue({
        id: '1',
        email: 'admin@lzt.com',
        password: 'hashed-password',
        firstname: 'Admin',
      });

      const result = await service.createManagedUser({
        email: 'admin@lzt.com',
        password: '1234567',
        firstname: 'Admin',
        lastname: 'User',
        birthday: '01/01/2000',
        phone: '11999999999',
        street: 'Rua A',
        city: 'Sao Paulo',
        state: 'SP',
        zip_code: '00000-000',
      });

      expect(mockPasswordService.hashPassword).toHaveBeenCalledWith('1234567');
      expect(result).toEqual({
        id: '1',
        email: 'admin@lzt.com',
        firstname: 'Admin',
      });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const changePasswordData = { old_password: 'old', new_password: 'new' };
      mockPasswordService.validatePassword.mockResolvedValue(true);
      mockPasswordService.hashPassword.mockResolvedValue('new-hashed');
      mockPrismaService.user.update.mockResolvedValue({ id: '1' });

      await service.changePassword(
        '1',
        'old-hashed',
        changePasswordData as any,
      );

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        data: { password: 'new-hashed' },
        where: { id: '1' },
      });
    });

    it('should throw UnauthorizedException if old password invalid', async () => {
      mockPasswordService.validatePassword.mockResolvedValue(false);

      await expect(
        service.changePassword('1', 'old-hashed', {
          old_password: 'wrong',
        } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateRole', () => {
    it('should update role successfully', async () => {
      mockPrismaService.user.update.mockResolvedValue({
        id: '1',
        role: Role.ADMIN,
      });

      const result = await service.updateRole('1', Role.ADMIN);

      expect(result.role).toBe(Role.ADMIN);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });
});
