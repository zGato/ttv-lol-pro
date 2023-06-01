import { Proxy } from "webextension-polyfill";
import findChannelFromUsherUrl from "../../common/ts/findChannelFromUsherUrl";
import findChannelFromVideoWeaverUrl from "../../common/ts/findChannelFromVideoWeaverUrl";
import getHostFromUrl from "../../common/ts/getHostFromUrl";
import isChannelWhitelisted from "../../common/ts/isChannelWhitelisted";
import isFlaggedRequest from "../../common/ts/isFlaggedRequest";
import {
  passportHostRegex,
  twitchGqlHostRegex,
  usherHostRegex,
  videoWeaverHostRegex,
} from "../../common/ts/regexes";
import store from "../../store";
import type { ProxyInfo } from "../../types";

export default async function onProxyRequest(
  details: Proxy.OnRequestDetailsType
): Promise<ProxyInfo | ProxyInfo[]> {
  const host = getHostFromUrl(details.url);
  if (!host) return { type: "direct" };

  // Wait for the store to be ready.
  if (store.readyState !== "complete") {
    await new Promise(resolve => {
      const listener = () => {
        store.removeEventListener("load", listener);
        resolve(onProxyRequest(details));
      };
      store.addEventListener("load", listener);
    });
  }

  const isFlagged =
    (store.state.optimizedProxiesEnabled &&
      isFlaggedRequest(details.requestHeaders)) ||
    !store.state.optimizedProxiesEnabled;
  const proxies = store.state.optimizedProxiesEnabled
    ? store.state.optimizedProxies
    : store.state.normalProxies;
  const proxyInfoArray = getProxyInfoArrayFromHosts(proxies);

  // Twitch webpage requests.
  if (store.state.proxyTwitchWebpage && host === "www.twitch.tv") {
    console.log(`⌛ Proxying ${details.url} through one of: <empty>`);
    return proxyInfoArray;
  }

  // Twitch GraphQL requests.
  if (
    store.state.proxyTwitchWebpage &&
    twitchGqlHostRegex.test(host) &&
    isFlagged
  ) {
    console.log(
      `⌛ Proxying ${details.url} through one of: ${
        proxies.toString() || "<empty>"
      }`
    );
    return proxyInfoArray;
  }

  // Passport requests.
  if (store.state.proxyUsherRequests && passportHostRegex.test(host)) {
    console.log(
      `⌛ Proxying ${details.url} through one of: ${
        proxies.toString() || "<empty>"
      }`
    );
    return proxyInfoArray;
  }

  // Usher requests.
  if (store.state.proxyUsherRequests && usherHostRegex.test(host)) {
    // Don't proxy whitelisted channels.
    const channelName = findChannelFromUsherUrl(details.url);
    if (isChannelWhitelisted(channelName)) {
      console.log(`✋ Channel '${channelName}' is whitelisted.`);
      return { type: "direct" };
    }
    console.log(
      `⌛ Proxying ${details.url} (${
        channelName ?? "unknown"
      }) through one of: ${proxies.toString() || "<empty>"}`
    );
    return proxyInfoArray;
  }

  // Video-weaver requests.
  if (videoWeaverHostRegex.test(host) && isFlagged) {
    // Don't proxy whitelisted channels.
    const channelName = findChannelFromVideoWeaverUrl(details.url);
    if (isChannelWhitelisted(channelName)) {
      console.log(`✋ Channel '${channelName}' is whitelisted.`);
      return { type: "direct" };
    }
    console.log(
      `⌛ Proxying ${details.url} (${
        channelName ?? "unknown"
      }) through one of: ${proxies.toString() || "<empty>"}`
    );
    return proxyInfoArray;
  }

  return { type: "direct" };
}

function getProxyInfoArrayFromHosts(hosts: string[]): ProxyInfo[] {
  return [
    ...hosts.map(host => {
      const [hostname, port] = host.split(":");
      return {
        type: "http",
        host: hostname,
        port: Number(port) ?? 3128,
      } as ProxyInfo;
    }),
    { type: "direct" } as ProxyInfo, // Fallback to direct connection if all proxies fail.
  ];
}
