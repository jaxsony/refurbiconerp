import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ONLY_KEY = 'platformOnly';
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);
