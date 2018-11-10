addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const _getGithubState = async ({platform}) => {
  const token = 'TOKEN';

  const proxyResponse = await fetch(`https://api.github.com/repos/modulesio/exokit/releases`, {
    headers: (() => {
      const headers = new Headers();
      headers.append('User-Agent', 'Exokit cloudflare');
      headers.append('Authorization', `token ${token}`);
      return headers;
    })(),
    redirect: 'follow',
  });
  let releases = await proxyResponse.json();
  releases = releases
    .filter(r => /^v[0-9]+\.[0-9]+\.[0-9]+$/.test(r.tag_name))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  console.log('got releases', releases);

  const requiredReleaseName = (() => {
    switch (platform) {
      case 'win':
        return 'exokit-win-x64.exe';                                      
      case 'mac':
        return 'exokit-macos-x64.dmg';
      case 'linux':
        return 'exokit-linux-bin.tar.gz';
      case 'magicleap':
        return 'exokit.mpk';
      default:
        return null;
    }
  })();

  console.log('got required release name', requiredReleaseName);

  const latestVersion = releases.length > 0 ? releases[0].tag_name : null;
  let redirect = null;
  for (let i = 0; i < releases.length; i++) {
    const release = releases[i];
    const {assets} = release;
    const asset = assets.find(asset => asset.name === requiredReleaseName);
    if (asset) {
      const {browser_download_url} = asset;
      redirect = browser_download_url;
      break;
    }
  }

  return {
    latestVersion,
    redirect,
  }
};
const _serveGithubState = async githubState => {
  const {redirect} = githubState;
  console.log('serve github', redirect);
  const response = await fetch(redirect);
  return response;
};
const _serveLinuxScript = async githubState => {
  const {latestVersion} = githubState;
  const proxyResponse = await fetch(`https://raw.githubusercontent.com/webmixedreality/exokit/master/scripts/exokit-install.sh`);
  const script = await proxyResponse.text();
  const scriptCompiled = script.replace(/\$VERSION/g, latestVersion);
  const response = new Response(scriptCompiled, {
    'Content-Type': 'text/x-shellscript',
  });
  return response;
};
const _serveVersion = async githubState => {
  const {latestVersion: version} = githubState;
  const response = new Response(JSON.stringify({version}), {
    'Content-Type': 'application/json',
  });
  return response;
};

async function handleRequest(request) {
  console.log('Got request', request);

  const {pathname} = new URL(request.url);

  console.log('Got pathname', pathname);

  if (pathname === '/windows') {
    return await _serveGithubState(await _getGithubState({platform: 'win'}));
  } else if (pathname === '/macos') {
    return await _serveGithubState(await _getGithubState({platform: 'mac'}));
  } else if (pathname === '/linux') {
    return await _serveLinuxScript(await _getGithubState({platform: 'linux'}));
  } else if (pathname === '/linux-bin') {
    return await _serveGithubState(await _getGithubState({platform: 'linux'}));
  } else if (pathname === '/magicleap') {
    return await _serveGithubState(await _getGithubState({platform: 'magicleap'}));
  } else if (pathname === '/version') {
    return await _serveVersion(await _getGithubState({platform: 'windows'}));
  } else { 
    const userAgent = request.headers.get('User-Agent');
    const match = userAgent.match(/\(.*?(win|mac|linux).*?\)/i);
    const platform = match ? match[1].toLowerCase() : 'linux';

    console.log('got user agent', userAgent, match, platform);

    const githubState = await _getGithubState({platform});
    if (platform !== 'linux') {
      return await _serveGithubState(githubState);
    } else {
      return await _serveLinuxScript(githubState);
    }
  }
}
