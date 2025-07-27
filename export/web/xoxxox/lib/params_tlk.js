//--------------------------------------------------------------------------
// 変数

export const PrmCmm = {
  mscchk: 2000, // ターン間の間隔（ミリ秒）
};

export const PrmSnd = {
  adrsnd: 'http://localhost:10001/sps000',
  thdvce: 0.1, // 音量の閾値（0.0〜1.0）
  mscend: 2000, // 無音と見なすまでの継続時間（ミリ秒）
};

export const PrmRcv = {
  adrrcv: 'http://localhost:10001/gpp000',
  thdvce: 0.05, // 音量の閾値（0.0〜1.0）
  adrswc: '',
  adrchr: 'http://localhost:10002/xoxxox/img/<c>_<m>.png',
  imgchr: 'imgchr_001_gcn',
  arrimg: 'c', // 配置
  sclimg: 0.75, // スケール
  poscox: 0.50, // 位置（横方向）
  poscoy: 0.00, // 位置（縦方向）
};
