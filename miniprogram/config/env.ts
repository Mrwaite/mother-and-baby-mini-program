// 运行环境与调用方式：体验版 / 正式版走云托管 callContainer；开发版默认用 wx.request 连本机服务

/** 云托管环境 ID（云托管控制台左上角） */
export const CLOUD_ENV = 'prod-xxxxxxxx';
/** 云托管服务名 */
export const CLOUD_SERVICE = 'api';
/** 本地开发服务地址；真机调试时改成电脑的局域网 IP */
export const DEV_API_BASE = 'http://localhost:3000';
/** 本地开发用的 openid（线上由微信网关注入），需要先在本地白名单里加上 */
export const DEV_OPENID = 'dev-openid';
/** 开发版也走云托管：用于灰度发布时自测新版本 */
export const DEVELOP_USE_CLOUD = false;

export type EnvVersion = 'develop' | 'trial' | 'release';

export function envVersion(): EnvVersion {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion as EnvVersion;
  } catch {
    return 'develop';
  }
}

export function useCloud(): boolean {
  return envVersion() !== 'develop' || DEVELOP_USE_CLOUD;
}

/** 小程序版本号，显示在「我的」页 */
export const APP_VERSION = '1.0.0';
