module.exports = (phase, { defaultConfig }) => {
  /**
   * @type {import('next').NextConfig}
   */
    console.log( "Next config" + process.env.SHORT_NAME );
  const nextConfig = {
      /* config options here */
      distDir: ".build"+process.env.SHORT_NAME
  }
  return nextConfig
}

