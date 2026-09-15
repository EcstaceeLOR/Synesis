# Versioned Base deployment manifest

`@synesis/olas-contracts` is the source of truth for contracts and calldata that may move value. The built-in `base-2026-09-15.1` manifest (`sha256:e585859ea3792a6838e99aa6eb4047f017001bac4b983b12717d791b1fc6f927`) is canonical-JSON encoded, content-hashed, and recursively frozen. An intent stores both `manifestVersion` and `contentHash`; `assertManifestReference` rejects a version or content mismatch.

## Pinned deployments

| Contract              | Base address                                 | Proxy implementation                         | Resolution          |
| --------------------- | -------------------------------------------- | -------------------------------------------- | ------------------- |
| Olas Mech Marketplace | `0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020` | `0x155547857680a6d51bebc5603397488988deb1c8` | `getImplementation` |
| Circle USDC           | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | `0x2ce6311ddae708829bc0784c967b7d77d19fd779` | `implementation`    |
| Aave V3 Pool          | `0xa238dd80c259a72e81d7e4664a9801593f98d1c5` | `0xa4abc5fcba6d0d7e3d144d6dbf6cb6128599dfdb` | EIP-1967 slot       |

The manifest also pins SHA-256 hashes of the runtime bytecode at all six addresses. Integration onboarding calls `verifyDeploymentHealth` and remains not ready if the RPC is not Base mainnet or any proxy code, implementation pointer, or implementation code differs. This makes an upstream upgrade visible and fail-closed.

Addresses and ABIs were checked against the official [Olas mech-client Base configuration](https://github.com/valory-xyz/mech-client/blob/main/mech_client/configs/mechs.json), [Olas Marketplace source and deployment configuration](https://github.com/valory-xyz/autonolas-marketplace), and [Aave V3 Base address book](https://github.com/aave-dao/aave-address-book/blob/main/src/AaveV3Base.sol). Source revisions are embedded in the manifest.

## Allowed calldata

Only these exact target and selector pairs are recognized:

| Operation     | Signature                                              | Selector     | Hard manifest bound                                               |
| ------------- | ------------------------------------------------------ | ------------ | ----------------------------------------------------------------- |
| Olas request  | `request(bytes,uint256,bytes32,address,uint256,bytes)` | `0xf6938b09` | USDC fixed-price type, ≤1 USDC, 60–300s, ≤8 KiB request           |
| USDC approval | `approve(address,uint256)`                             | `0x095ea7b3` | spender is Aave Pool, ≤10,000 USDC                                |
| Aave supply   | `supply(address,uint256,address,uint16)`               | `0x617ba037` | Base USDC, ≤10,000 USDC, referral 0, beneficiary is Keeper wallet |

`validateCalldata` decodes raw ABI words, checks canonical dynamic offsets and padding by exact re-encoding, and refuses trailing data. Olas priority Mechs must also appear in the compatibility-discovery allowlist supplied for the intent. Unknown chains, targets, selectors, ambiguous ABI entries, payment types, beneficiaries, values, or excessive amounts throw before KeeperHub is called.

## Updating deployments

Never edit a manifest already referenced by an intent. Create a new `manifestVersion`, update the pinned source revision and live expectations, and call `createManifestUpdate` with an actor, reason, and timestamp. It returns the newly hashed immutable manifest plus a `deployment_manifest.version_created` audit event linking the previous and next hashes. The new version must pass startup health checks before activation.
