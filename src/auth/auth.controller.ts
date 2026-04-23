import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupInput } from './dto/signup.input';
import { LoginInput } from './dto/login.input';
import { RefreshTokenInput } from './dto/refresh-token.input';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Registrar um novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  async signup(@Body() data: SignupInput) {
    data.email = data.email.toLowerCase();
    const tokens = await this.auth.createUser(data);
    return {
      message: 'Criado usuario com sucesso!',
      ...tokens,
    };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Realizar login' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  async login(@Body() { email, password }: LoginInput) {
    return await this.auth.login(email.toLowerCase(), password);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Atualizar o access token usando o refresh token' })
  @ApiResponse({ status: 200, description: 'Token atualizado com sucesso' })
  async refreshToken(@Body() { token }: RefreshTokenInput) {
    return this.auth.refreshToken(token);
  }
}
