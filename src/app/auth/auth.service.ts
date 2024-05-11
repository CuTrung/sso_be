import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { StringUtilService } from 'src/common/utils/string/string-util.service';
import { TokenExpireIn } from 'src/consts/jwt.const';
import { SignInDto, SignUpDto } from './dto/sign.dto';
import { AuthToken } from './types/token.type';
import { ConfigService } from '@nestjs/config';
import { EnvVars } from 'src/consts';
import { GoogleUserDto } from './dto/google-oauth2.dto';
import { TypeLogin } from '../user/entities/user.entity';
import { MailerService } from '@nestjs-modules/mailer';
import { MailTemplate } from 'src/consts/mail.const';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';
import { JwtService } from '@nestjs/jwt';
import { GithubUserDto } from './dto/github.dto';
import { WebpageService } from '../webpage/webpage.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private stringUtilService: StringUtilService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly webpageService: WebpageService
  ) {}

  private readonly VERIFY_PASSWORD_EXPIRE_IN = '5m';

  async verifyToken(
    token: string,
    secret_key: string = this.configService.get(EnvVars.JWT_SECRET_KEY)
  ) {
    try {
      const decoded = await this.jwtService.verifyAsync(token, {
        secret: secret_key,
      });
      return { decoded, error: null };
    } catch (error) {
      return { decoded: null, error };
    }
  }

  async createToken(payload): Promise<AuthToken> {
    const access_token = await this.jwtService.signAsync(payload);

    const refresh_token = await this.jwtService.signAsync(payload, {
      expiresIn: TokenExpireIn.REFRESH_TOKEN_EXPIRE_IN,
    });

    return {
      access_token,
      refresh_token,
    };
  }

  async signUp(signUpDto: SignUpDto) {
    const user = await this.userService.getInstance().findFirst({
      where: {
        OR: [
          { user_email: signUpDto.email },
          { user_name: signUpDto.user_name },
          { user_phone_number: signUpDto.phone_number },
        ],
      },
    });

    if (user) throw new BadRequestException('Information has been registered!');

    signUpDto.password =
      signUpDto.password ?? this.stringUtilService.genRandom();

    const userCreated = await this.userService.create({
      user_email: signUpDto.email,
      user_password: await this.stringUtilService.hashSync(signUpDto.password),
      user_name: signUpDto.user_name,
      user_first_name: signUpDto.user_first_name,
      user_last_name: signUpDto.user_last_name,
      user_phone_number: signUpDto.phone_number,
      user_date_of_birth: signUpDto.date_of_birth,
      user_image_url: signUpDto.user_image_url,
      user_type_login: signUpDto.user_type_login,
    });

    if (!userCreated) throw new BadRequestException('Sign up failed');

    return await this.signIn({
      user_name: userCreated.user_name,
      password: signUpDto.password,
    });
  }

  async signIn(signInDto: SignInDto) {
    const user_name = signInDto.user_name;
    const conditionFindUser = {
      OR: [
        { user_name },
        { user_email: user_name },
        { user_phone_number: user_name },
      ],
      user_type_login: signInDto.user_type_login ?? TypeLogin.ACCOUNT,
    };
    if (signInDto.password) delete conditionFindUser.user_type_login;
    const user = await this.userService.getInstance().findFirst({
      where: conditionFindUser,
      select: {
        user_id: true,
        user_name: true,
        user_password: true,
        Role: {
          select: {
            GroupRole: {
              select: {
                GroupPermission: {
                  select: {
                    Permission: {
                      select: {
                        permission_key: true,
                      },
                    },
                  },
                },
              },
            },
            role_is_all_permissions: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException();

    if (signInDto.password) {
      const is_correct_pwd = await this.stringUtilService.compareHashSync(
        signInDto.password,
        user.user_password
      );
      if (!is_correct_pwd) throw new UnauthorizedException();
    }

    const { user_password, Role, ...userData } = user;
    const data = {
      ...userData,
      isAdmin: Role?.role_is_all_permissions ? true : false,
      permissions:
        Role?.GroupRole?.GroupPermission?.reduce(
          (acc, item) =>
            acc.concat(item.Permission.map((per) => per.permission_key)),
          []
        ) ?? [],
    };
    return {
      ...(await this.createToken(data)),
      ...data,
    };
  }

  async signUpWithGoogleOAuth2(user: GoogleUserDto) {
    if (!user) throw new UnauthorizedException('Not found user from google!');

    const userFind = await this.userService.getInstance().findFirst({
      where: {
        user_email: user.email,
        user_type_login: TypeLogin.GOOGLE,
      },
    });

    if (userFind)
      return await this.signIn({
        user_name: userFind.user_name,
        user_type_login: TypeLogin.GOOGLE,
      });

    return await this.signUp({
      email: user.email,
      user_first_name: user.first_name,
      user_last_name: user.last_name,
      user_name: `${user.first_name} ${user.last_name}`,
      password: null,
      user_image_url: user.picture,
      user_type_login: TypeLogin.GOOGLE,
    });
  }

  async signUpWithGithub(user: GithubUserDto) {
    if (!user) throw new UnauthorizedException('Not found user from google!');
    const userFind = await this.userService.getInstance().findFirst({
      where: {
        user_email: user.email ?? user.user_name,
        user_type_login: TypeLogin.GITHUB,
      },
    });

    if (userFind)
      return await this.signIn({
        user_name: userFind.user_name,
        user_type_login: TypeLogin.GITHUB,
      });

    return await this.signUp({
      email: user.email,
      user_first_name: user.first_name,
      user_last_name: user.last_name,
      user_name: user.user_name ?? `${user.first_name} ${user.last_name}`,
      password: null,
      user_image_url: user.avatar_url,
      user_type_login: TypeLogin.GITHUB,
    });
  }

  sendSMS() {
    return {};
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userService.getInstance().findFirst({
      where: {
        OR: [
          { user_email: forgotPasswordDto.email },
          { user_phone_number: forgotPasswordDto.phone_number },
        ],
      },
    });

    if (!user) throw new UnauthorizedException('Not found user');

    if (forgotPasswordDto.email) {
      this.mailerService.sendMail({
        to: user.user_email,
        subject: 'Reset password',
        template: MailTemplate.RESET_PASSWORD,
        context: {
          redirect_to: forgotPasswordDto.redirect_to,
        },
      });
    } else {
      this.sendSMS();
    }

    const code_reset = this.stringUtilService.encrypt(
      {
        user_id: user.user_id,
      },
      this.VERIFY_PASSWORD_EXPIRE_IN
    );
    return { code_reset };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const decoded = this.stringUtilService.decrypt(resetPasswordDto.code_reset);

    if (!decoded) throw new BadRequestException('Reset password failed');

    return await this.userService.update({
      user_id: decoded.user_id,
      user_password: await this.stringUtilService.hashSync(
        resetPasswordDto.password
      ),
    });
  }

  async getWebpageRedirect(webpage_key: string) {
    const webpage = await this.webpageService.getInstance().findFirst({
      select: {
        webpage_url: true,
      },
      where: {
        webpage_key,
      },
    });
    return webpage;
  }
}
