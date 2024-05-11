import { StringUtilService } from 'src/common/utils/string/string-util.service';
import { RedirectToInterceptor } from './redirect-to.interceptor';
import { Test } from '@nestjs/testing';
import { AutoMockingTestingModule } from 'src/common/testing/auto-mocking/auto-mocking-testing.module';

describe('RedirectToInterceptor', () => {
  let interceptor: RedirectToInterceptor;

  beforeAll(async () => {
    const app = await AutoMockingTestingModule.createTestingModule({
      providers: [RedirectToInterceptor],
    });

    interceptor = app.get(RedirectToInterceptor);
  });
  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });
});
