import { PrismaService } from 'nestjs-prisma';
import { Role, Prisma } from '@prisma/client';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { ChangePasswordInput } from './dto/change-password.input';
import { UpdateUserInput } from './dto/update-user.input';
import { SignupInput } from '../auth/dto/signup.input';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwordService: PasswordService,
  ) {}

  private parseBirthday(birthday: string): Date {
    const [day, month, year] = birthday.split('/').map(Number);
    return new Date(year, month - 1, day);
  }

  async createUser(data: SignupInput & { password: string }) {
    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          birthday: this.parseBirthday(data.birthday),
          role: 'USER',
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`O e-mail ${data.email} já está em uso.`);
      }
      throw e;
    }
  }

  async createManagedUser(data: SignupInput) {
    const hashedPassword = await this.passwordService.hashPassword(
      data.password,
    );

    const user = await this.createUser({
      ...data,
      password: hashedPassword,
    });

    const result = { ...user };
    delete result.password;
    return result;
  }

  updateUser(userId: string, newUserData: UpdateUserInput) {
    const data = { ...newUserData };
    if (data.birthday) {
      (data as any).birthday = this.parseBirthday(data.birthday);
    }

    return this.prisma.user.update({
      data: data as any,
      where: {
        id: userId,
      },
    });
  }

  async changePassword(
    userId: string,
    userPassword: string,
    changePassword: ChangePasswordInput,
  ) {
    const passwordValid = await this.passwordService.validatePassword(
      changePassword.old_password,
      userPassword,
    );

    if (changePassword.old_password === changePassword.new_password) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha antiga',
      );
    }

    if (!passwordValid) {
      throw new UnauthorizedException('Senha antiga incorreta');
    }

    const hashedPassword = await this.passwordService.hashPassword(
      changePassword.new_password,
    );

    return this.prisma.user.update({
      data: {
        password: hashedPassword,
      },
      where: { id: userId },
    });
  }

  async updateRole(userId: string, newRole: Role) {
    try {
      return await this.prisma.user.update({
        data: { role: newRole },
        where: { id: userId },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Usuário não encontrado');
      }
      throw e;
    }
  }
}
