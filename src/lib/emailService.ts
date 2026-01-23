// src/lib/emailService.ts
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface InvitationEmailData {
  to: string;
  invitedBy: string;
  clientName?: string;
  acceptUrl: string;
  expiresInHours: number;
}

export interface MessageNotificationData {
  to: string[];
  senderName: string;
  messagePreview: string;
  conversationUrl: string;
}

/**
 * Email service for sending notifications
 * 
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all emails.
 * Supabase Auth emails are disabled - we handle all email sending here.
 * 
 * Development: Logs to console
 * Production: TODO - Integrate with SendGrid/AWS SES
 */
export class EmailService {
  /**
   * Send invitation email to a new user
   * This is the ONLY place invitation emails are sent from.
   * Supabase Auth does NOT send invitation emails.
   */
  async sendInvitation(data: InvitationEmailData): Promise<void> {
    const emailContent = this.generateInvitationEmail(data);

    if (env.nodeEnv === 'production') {
      // TODO: Send via SendGrid/AWS SES in production
      logger.warn('Email sending not implemented in production yet', { 
        to: data.to,
        type: 'invitation',
      });
      // Future implementation:
      // await this.sendViaProvider(data.to, 'You\'ve been invited to De Bedrijfsfiscalist', emailContent);
    } else {
      // Development: Log to console
      logger.info('📧 Invitation Email (DEV MODE - Not actually sent)', {
        to: data.to,
        subject: 'You\'ve been invited to De Bedrijfsfiscalist',
        acceptUrl: data.acceptUrl,
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('📧 INVITATION EMAIL (DEVELOPMENT MODE - NOT SENT)');
      console.log('='.repeat(70));
      console.log(`To: ${data.to}`);
      console.log(`Subject: You've been invited to De Bedrijfsfiscalist`);
      console.log('\n' + emailContent);
      console.log('='.repeat(70) + '\n');
    }
  }

  /**
   * Generate HTML/text content for invitation email
   */
  private generateInvitationEmail(data: InvitationEmailData): string {
    return `
Hello!

${data.invitedBy} has invited you to join De Bedrijfsfiscalist${data.clientName ? ` for ${data.clientName}` : ''}.

To accept this invitation and set up your account, please click the link below:

${data.acceptUrl}

This invitation will expire in ${data.expiresInHours} hours.

If you didn't expect this invitation, you can safely ignore this email.

Best regards,
De Bedrijfsfiscalist Team
    `.trim();
  }

  /**
   * Future: Send password reset email
   * TODO: Implement when needed
   */
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    logger.info('Password reset email (not implemented)', { email, resetUrl });
    // TODO: Implement password reset email
  }

  /**
   * Send message notification email
   * Used for client-admin messaging notifications
   */
  async sendMessageNotification(data: MessageNotificationData): Promise<void> {
    if (data.to.length === 0) {
      logger.warn('No recipients for message notification');
      return;
    }

    const subject = 'New message from De Bedrijfsfiscalist';
    const emailContent = this.generateMessageNotificationEmail(data);

    if (env.nodeEnv === 'production' && env.email.provider === 'sendgrid') {
      await this.sendViaSendGrid(data.to, subject, emailContent);
    } else {
      // Development or console mode: Log to console
      logger.info('📧 Message Notification Email (DEV MODE - Not actually sent)', {
        to: data.to,
        subject,
        senderName: data.senderName,
        conversationUrl: data.conversationUrl,
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('📧 MESSAGE NOTIFICATION EMAIL (DEVELOPMENT MODE - NOT SENT)');
      console.log('='.repeat(70));
      console.log(`To: ${data.to.join(', ')}`);
      console.log(`Subject: ${subject}`);
      console.log('\n' + emailContent);
      console.log('='.repeat(70) + '\n');
    }
  }

  /**
   * Generate content for message notification email
   */
  private generateMessageNotificationEmail(data: MessageNotificationData): string {
    return `
Hello,

${data.senderName} has sent you a new message:

"${data.messagePreview}"

To view and respond to this message, please visit:
${data.conversationUrl}

Best regards,
De Bedrijfsfiscalist Team
    `.trim();
  }

  /**
   * Send email via SendGrid
   */
  private async sendViaSendGrid(to: string[], subject: string, content: string): Promise<void> {
    if (!env.email.sendgridApiKey) {
      logger.warn('SendGrid API key not configured, skipping email send', { to, subject });
      return;
    }

    try {
      // Dynamic import to avoid requiring @sendgrid/mail in dev/test
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(env.email.sendgridApiKey);

      await sgMail.default.send({
        to,
        from: env.email.from,
        subject,
        text: content,
        html: this.convertToHtml(content),
      });

      logger.info('Email sent via SendGrid', { to, subject });
    } catch (error) {
      logger.error('Failed to send email via SendGrid', {
        error: error instanceof Error ? error.message : String(error),
        to,
        subject,
      });
      // Don't throw - email failure should not break the API response
    }
  }

  /**
   * Convert plain text to simple HTML
   */
  private convertToHtml(text: string): string {
    return text
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  /**
   * Future: Send welcome email after user completes registration
   * TODO: Implement when needed
   */
  async sendWelcome(email: string, userName: string): Promise<void> {
    logger.info('Welcome email (not implemented)', { email, userName });
    // TODO: Implement welcome email
  }
}

// Export singleton instance
export const emailService = new EmailService();

