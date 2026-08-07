import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });

describe('MailService', () => {
  let mailService: MailService;

  beforeEach(async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();
    mailService = module.get<MailService>(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls transporter.sendMail with correct fields', async () => {
    mailService.sendMail('rep@quoteiq.com', 'Subject', '<p>Body</p>');

    // fire-and-forget — flush the microtask queue
    await Promise.resolve();

    expect(mockSendMail).toHaveBeenCalledWith({
      from: process.env.MAIL_FROM,
      to: 'rep@quoteiq.com',
      subject: 'Subject',
      html: '<p>Body</p>',
    });
  });

  it('returns void — does not throw even when transporter rejects', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));

    expect(() =>
      mailService.sendMail('rep@quoteiq.com', 'Subject', '<p>Body</p>'),
    ).not.toThrow();

    // allow the rejection to be handled by .catch()
    await Promise.resolve();
  });

  it('logs error via NestJS logger when transporter rejects', async () => {
    const loggerSpy = jest
      .spyOn(mailService['logger'], 'error')
      .mockImplementation(() => {});
    mockSendMail.mockRejectedValueOnce(new Error('SMTP down'));

    mailService.sendMail('rep@quoteiq.com', 'Subject', '<p>Body</p>');
    await Promise.resolve();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('rep@quoteiq.com'),
      expect.any(String),
    );
    loggerSpy.mockRestore();
  });
});
