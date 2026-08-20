export type SupportWallet = {
  asset: string;
  network: string;
  address: string;
};

export type SupportContact = {
  label: string;
  kind: "email" | "url";
  value: string;
};

export type Supporter = {
  name: string;
  amount: string;
  date: string;
};

// Replace only the REPLACE_WITH_* values below. Wallet addresses are public
// receiving addresses, never seed phrases, private keys, or exchange login details.
export const supportConfig = {
  wallets: [
    { asset: "Bitcoin", network: "Bitcoin", address: "bc1q40yfe3yl2awlzgd0nm5mnrpl272f3sdnweun2h" },
    { asset: "Ethereum", network: "Ethereum (ERC-20)", address: "0x842078F5e6299705D1d24CDF3c849841B78eDda7" },
    { asset: "TRON", network: "TRON", address: "TLVbCmJtVt16osanvpWoYiue4wWK71EDQc" },
    { asset: "USDT", network: "TRON (TRC-20)", address: "TLVbCmJtVt16osanvpWoYiue4wWK71EDQc" },
    { asset: "Litecoin", network: "Litecoin", address: "ltc1q055zysaacm237z03xtgaxhpenyjp4zr2n9edkf" },
    { asset: "Cardano", network: "Cardano", address: "addr1qy6s04fepe8eadz3w6782tnnh6tdknazs2h902lcfccy3vxmrkj5vjrk6rvy7vw2hsvykvnve0wjl965rxr2tnj32a7qznm2f0" },
    { asset: "Dogecoin", network: "Dogecoin", address: "DE9AKLPryCd6h6FrNF3hAV5tazLkd45AL2" },
  ] satisfies SupportWallet[],
  contacts: [
    { label: "Email", kind: "email", value: "astrosphere@qrypty.com" },
    { label: "Telegram", kind: "url", value: "REPLACE_WITH_TELEGRAM_URL" },
    { label: "X", kind: "url", value: "https://x.com/Akhu176" },
    { label: "Signal", kind: "url", value: "REPLACE_WITH_SIGNAL_URL" },
    { label: "EFChat", kind: "url", value: "https://efchat.net/AstroSphere" },
    { label: "GitHub", kind: "url", value: "https://github.com/astra-chanUwU" },
    { label: "Discord", kind: "url", value: "REPLACE_WITH_DISCORD_URL" },
    { label: "Matrix", kind: "url", value: "REPLACE_WITH_MATRIX_URL" },
  ] satisfies SupportContact[],
  // Add a person here only after they explicitly ask to be credited publicly.
  supporters: [] as Supporter[],
  // Development-only example data. It is never rendered in a production build.
  exampleSupporters: [
    { name: "Orbit-07", amount: "0.0008 BTC", date: "2026-07-29" },
    { name: "Moss Signal", amount: "22 USDT", date: "2026-07-22" },
    { name: "Comet Index", amount: "0.31 SOL", date: "2026-07-14" },
    { name: "Anonymous Relay", amount: "0.014 XMR", date: "2026-06-30" },
  ] satisfies Supporter[],
};

export const isConfiguredSupportValue = (value: string) =>
  value.trim().length > 0 && !value.startsWith("REPLACE_WITH_");
