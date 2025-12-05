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

/**
 * Email service for sending notifications
 * MVP: Console-only implementation for development
 * TODO: Integrate with SendGrid/AWS SES for production
 */
export class EmailService {
  /**
   * Send invitation email to a new user
   * Development: Logs to console instead of sending actual email
   * Production: TODO - Integrate with real email provider
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
   * Future: Send welcome email after user completes registration
   * TODO: Implement when needed
   */
  async sendWelcome(email: string, userName: string): Promise<void> {
    logger.info('Welcome email (not implemented)', { email, userName });
    // TODO: Implement welcome email
  }

  // TODO: Implement real email provider integration
  // private async sendViaProvider(to: string, subject: string, content: string): Promise<void> {
  //   // Example for SendGrid:
  //   // const sgMail = require('@sendgrid/mail');
  //   // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  //   // await sgMail.send({
  //   //   to,
  //   //   from: 'noreply@debedrijfsfiscalist.com',
  //   //   subject,
  //   //   text: content,
  //   //   html: this.convertToHtml(content),
  //   // });
  //
  //   // Example for AWS SES:
  //   // const AWS = require('aws-sdk');
  //   // const ses = new AWS.SES({ region: process.env.AWS_SES_REGION });
  //   // await ses.sendEmail({
  //   //   Source: 'noreply@debedrijfsfiscalist.com',
  //   //   Destination: { ToAddresses: [to] },
  //   //   Message: {
  //   //     Subject: { Data: subject },
  //   //     Body: { Text: { Data: content } },
  //   //   },
  //   // }).promise();
  // }
}

// Export singleton instance
export const emailService = new EmailService();

