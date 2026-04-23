import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserEntity } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { Role } from '@prisma/client';
import { User } from './entities/user.entity';
import { ChangePasswordInput } from './dto/change-password.input';
import { UpdateUserInput } from './dto/update-user.input';
import { UpdateRoleInput } from './dto/update-role.input';
import { PrismaService } from 'nestjs-prisma';
import { SignupInput } from '../auth/dto/signup.input';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter perfil do usuário logado' })
  @ApiResponse({ status: 200, type: User })
  async me(@UserEntity() user: User): Promise<User> {
    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const { password, ...result } = user;
    return result as User;
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos os usuários (Apenas Admin)' })
  @ApiResponse({ status: 200, type: [User] })
  async allUsers() {
    const users = await this.prisma.user.findMany();
    return users.map(({ password, ...user }) => user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar usuario (Apenas Admin)' })
  @ApiResponse({ status: 201, type: User })
  async createUser(@Body() data: SignupInput) {
    data.email = data.email.toLowerCase();
    return this.usersService.createManagedUser(data);
  }

  @Patch()
  @ApiOperation({ summary: 'Atualizar informações do perfil' })
  @ApiResponse({ status: 200, type: User })
  async updateUser(
    @UserEntity() user: User,
    @Body() newUserData: UpdateUserInput,
  ) {
    await this.usersService.updateUser(user.id, newUserData);
    return {
      message: 'Usuário alterado com Sucesso!',
    };
  }

  @Patch('change-password')
  @ApiOperation({ summary: 'Alterar senha' })
  @ApiResponse({ status: 200, type: User })
  async changePassword(
    @UserEntity() user: User,
    @Body() changePassword: ChangePasswordInput,
  ) {
    await this.usersService.changePassword(
      user.id,
      user.password,
      changePassword,
    );
    return {
      message: 'Senha alterada com Sucesso!',
    };
  }

  @Patch('role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualizar cargo de um usuário (Apenas Admin)' })
  @ApiResponse({ status: 200, type: User })
  async updateRole(@Body() updateRoleData: UpdateRoleInput) {
    await this.usersService.updateRole(
      updateRoleData.user_id,
      updateRoleData.role,
    );
    return {
      message: 'Cargo alterado com Sucesso!',
    };
  }
}
