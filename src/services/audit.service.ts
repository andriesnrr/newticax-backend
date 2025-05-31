import { prisma } from '../config/db';
import { logger } from '../utils/logger';

export interface AuditLog {
  id?: string;
  action: string;
  userId?: string;
  targetId?: string;
  targetType?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
  timestamp?: Date;
}

export class AuditService {
  // Log user actions
  static async logAction(auditData: AuditLog): Promise<void> {
    try {
      // Log to database (if you have an audit table)
      // await prisma.auditLog.create({ data: auditData });

      // Log to file system
      logger.info('Audit Log', {
        action: auditData.action,
        userId: auditData.userId,
        targetId: auditData.targetId,
        targetType: auditData.targetType,
        details: auditData.details,
        ip: auditData.ip,
        userAgent: auditData.userAgent,
        timestamp: auditData.timestamp || new Date(),
      });
    } catch (error) {
      logger.error('Failed to log audit action', { error, auditData });
    }
  }

  // User authentication events
  static async logLogin(userId: string, ip: string, userAgent: string, success: boolean): Promise<void> {
    await this.logAction({
      action: success ? 'USER_LOGIN_SUCCESS' : 'USER_LOGIN_FAILED',
      userId: success ? userId : undefined,
      details: { success },
      ip,
      userAgent,
    });
  }

  static async logLogout(userId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'USER_LOGOUT',
      userId,
      ip,
    });
  }

  static async logRegistration(userId: string, ip: string, userAgent: string): Promise<void> {
    await this.logAction({
      action: 'USER_REGISTRATION',
      userId,
      ip,
      userAgent,
    });
  }

  // Content management events
  static async logArticleCreate(authorId: string, articleId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'ARTICLE_CREATED',
      userId: authorId,
      targetId: articleId,
      targetType: 'article',
      ip,
    });
  }

  static async logArticleUpdate(editorId: string, articleId: string, changes: any, ip: string): Promise<void> {
    await this.logAction({
      action: 'ARTICLE_UPDATED',
      userId: editorId,
      targetId: articleId,
      targetType: 'article',
      details: { changes },
      ip,
    });
  }

  static async logArticleDelete(deleterId: string, articleId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'ARTICLE_DELETED',
      userId: deleterId,
      targetId: articleId,
      targetType: 'article',
      ip,
    });
  }

  // Admin actions
  static async logUserRoleChange(adminId: string, targetUserId: string, oldRole: string, newRole: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'USER_ROLE_CHANGED',
      userId: adminId,
      targetId: targetUserId,
      targetType: 'user',
      details: { oldRole, newRole },
      ip,
    });
  }

  static async logUserDelete(adminId: string, targetUserId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'USER_DELETED',
      userId: adminId,
      targetId: targetUserId,
      targetType: 'user',
      ip,
    });
  }

  static async logAdminAccess(adminId: string, resource: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'ADMIN_ACCESS',
      userId: adminId,
      details: { resource },
      ip,
    });
  }

  // Security events
  static async logSecurityEvent(event: string, details: any, ip?: string, userId?: string): Promise<void> {
    await this.logAction({
      action: `SECURITY_${event.toUpperCase()}`,
      userId,
      details,
      ip,
    });
  }

  static async logPasswordChange(userId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'PASSWORD_CHANGED',
      userId,
      ip,
    });
  }

  static async logPasswordReset(userId: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'PASSWORD_RESET',
      userId,
      ip,
    });
  }

  // Data access events
  static async logDataExport(userId: string, dataType: string, ip: string): Promise<void> {
    await this.logAction({
      action: 'DATA_EXPORTED',
      userId,
      details: { dataType },
      ip,
    });
  }

  // System events
  static async logSystemEvent(event: string, details?: any): Promise<void> {
    await this.logAction({
      action: `SYSTEM_${event.toUpperCase()}`,
      details,
    });
  }

  // Get audit logs (for admin dashboard)
  static async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    targetType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    // This would query your audit log table
    // For now, return empty array since we're using file logging
    return [];
  }

  // Generate audit report
  static async generateReport(startDate: Date, endDate: Date): Promise<any> {
    return {
      period: { startDate, endDate },
      summary: {
        totalActions: 0,
        userLogins: 0,
        articleCreated: 0,
        securityEvents: 0,
      },
      topActions: [],
      securityEvents: [],
    };
  }
}