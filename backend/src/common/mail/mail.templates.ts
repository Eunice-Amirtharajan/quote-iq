export function inviteEmailHtml(name: string, inviteUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
      <h2 style="margin:0 0 8px">You've been invited to QuoteIQ</h2>
      <p style="color:#555;margin:0 0 24px">Hi ${name}, a manager has invited you to join QuoteIQ as a Sales Rep.</p>
      <a href="${inviteUrl}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500">
        Set your password
      </a>
      <p style="color:#999;font-size:12px;margin:24px 0 0">This link expires in 24 hours. If you didn't expect this email, you can ignore it.</p>
    </div>
  `;
}

export function passwordResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#111">
      <h2 style="margin:0 0 8px">Reset your password</h2>
      <p style="color:#555;margin:0 0 24px">We received a request to reset your QuoteIQ password.</p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500">
        Reset password
      </a>
      <p style="color:#999;font-size:12px;margin:24px 0 0">This link expires in 1 hour. If you didn't request a reset, you can ignore this email.</p>
    </div>
  `;
}
