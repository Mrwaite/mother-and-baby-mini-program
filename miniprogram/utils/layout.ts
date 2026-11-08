// 布局尺寸：自定义导航栏高度（状态栏 + 胶囊所在行）

export interface NavMetrics {
  statusBarHeight: number;
  navHeight: number;
  /** 右侧需要给胶囊按钮留出的宽度 */
  capsuleRight: number;
  /** 导航栏总高度（px），吸顶元素的 top */
  total: number;
}

let cached: NavMetrics | null = null;

export function navMetrics(): NavMetrics {
  if (cached) return cached;
  const win = wx.getWindowInfo();
  const capsule = wx.getMenuButtonBoundingClientRect();
  const statusBarHeight = win.statusBarHeight || 20;
  // 让胶囊在导航栏内垂直居中
  const navHeight = capsule && capsule.height ? (capsule.top - statusBarHeight) * 2 + capsule.height : 44;
  const capsuleRight = capsule && capsule.width ? win.windowWidth - capsule.left + 8 : 96;
  cached = { statusBarHeight, navHeight, capsuleRight, total: statusBarHeight + navHeight };
  return cached;
}
