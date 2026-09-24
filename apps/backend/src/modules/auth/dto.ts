import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { RegisterDto, LoginDto, RefreshTokenDto } from '@summit-okr/api-types';

export class RegisterDtoImpl implements RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: '邮箱' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'summitokr', description: '用户名（3-30 字符）' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, {
    message: '用户名仅支持中英文/数字/下划线',
  })
  username!: string;

  @ApiProperty({ example: 'password123', description: '密码（6-50 字符）' })
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password!: string;
}

export class LoginDtoImpl implements LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RefreshTokenDtoImpl implements RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  refreshToken!: string;
}
