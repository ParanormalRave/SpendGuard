/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/spendguard.json`.
 */
export type Spendguard = {
  "address": "AzvuWQBBrawzLRFYkH7DiCY4c9326cnncJWGkySnEsEZ",
  "metadata": {
    "name": "spendguard",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addRecipient",
      "discriminator": [
        207,
        170,
        166,
        28,
        210,
        186,
        242,
        145
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "recipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "agentTransfer",
      "discriminator": [
        199,
        111,
        151,
        49,
        124,
        13,
        150,
        44
      ],
      "accounts": [
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "agent",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelWithdraw",
      "discriminator": [
        112,
        53,
        226,
        58,
        158,
        30,
        37,
        168
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closePolicy",
      "discriminator": [
        55,
        42,
        248,
        229,
        222,
        138,
        26,
        252
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeWithdraw",
      "discriminator": [
        255,
        93,
        15,
        141,
        187,
        94,
        246,
        162
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializePolicy",
      "discriminator": [
        9,
        186,
        86,
        225,
        129,
        162,
        231,
        56
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "agent",
          "docs": [
            "The agent must be a system-owned wallet, not a program or PDA."
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "policyId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "here; `deposit` creates and funds it. We only need its canonical bump."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "policyId",
          "type": "u64"
        },
        {
          "name": "perTxLimit",
          "type": "u64"
        },
        {
          "name": "windowLimit",
          "type": "u64"
        },
        {
          "name": "windowSeconds",
          "type": "i64"
        },
        {
          "name": "withdrawDelaySeconds",
          "type": "i64"
        },
        {
          "name": "allowedRecipients",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "requestWithdraw",
      "discriminator": [
        137,
        95,
        187,
        96,
        250,
        138,
        31,
        182
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "policy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "policy"
          ]
        },
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.owner",
                "account": "policy"
              },
              {
                "kind": "account",
                "path": "policy.policyId",
                "account": "policy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "policy",
      "discriminator": [
        222,
        135,
        7,
        163,
        235,
        177,
        33,
        68
      ]
    }
  ],
  "events": [
    {
      "name": "pausedChanged",
      "discriminator": [
        12,
        10,
        153,
        247,
        60,
        115,
        137,
        69
      ]
    },
    {
      "name": "paymentExecuted",
      "discriminator": [
        153,
        165,
        141,
        18,
        246,
        20,
        204,
        227
      ]
    },
    {
      "name": "policyInitialized",
      "discriminator": [
        102,
        184,
        59,
        178,
        235,
        69,
        251,
        181
      ]
    },
    {
      "name": "recipientAdded",
      "discriminator": [
        223,
        210,
        68,
        47,
        151,
        245,
        200,
        89
      ]
    },
    {
      "name": "withdrawCancelled",
      "discriminator": [
        162,
        153,
        181,
        47,
        154,
        132,
        183,
        117
      ]
    },
    {
      "name": "withdrawExecuted",
      "discriminator": [
        132,
        197,
        103,
        54,
        18,
        141,
        117,
        0
      ]
    },
    {
      "name": "withdrawRequested",
      "discriminator": [
        114,
        16,
        240,
        206,
        93,
        128,
        151,
        39
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the policy agent can make payments"
    },
    {
      "code": 6001,
      "name": "paused",
      "msg": "The policy is paused"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "exceedsPerTxLimit",
      "msg": "Amount exceeds the per-transaction limit"
    },
    {
      "code": 6004,
      "name": "exceedsWindowLimit",
      "msg": "Amount exceeds the window limit"
    },
    {
      "code": 6005,
      "name": "recipientNotAllowed",
      "msg": "Recipient is not on the allowlist"
    },
    {
      "code": 6006,
      "name": "insufficientVaultFunds",
      "msg": "Vault does not have enough funds"
    },
    {
      "code": 6007,
      "name": "fundsReserved",
      "msg": "Funds are reserved for a pending withdrawal"
    },
    {
      "code": 6008,
      "name": "invalidPolicyConfig",
      "msg": "Invalid policy configuration"
    },
    {
      "code": 6009,
      "name": "recipientListFull",
      "msg": "Recipient list is full"
    },
    {
      "code": 6010,
      "name": "duplicateRecipient",
      "msg": "Recipient is already on the allowlist"
    },
    {
      "code": 6011,
      "name": "invalidRecipient",
      "msg": "Invalid recipient"
    },
    {
      "code": 6012,
      "name": "withdrawalAlreadyPending",
      "msg": "A withdrawal is already pending"
    },
    {
      "code": 6013,
      "name": "noPendingWithdrawal",
      "msg": "No withdrawal is pending"
    },
    {
      "code": 6014,
      "name": "withdrawalNotReady",
      "msg": "Withdrawal is not ready to be released"
    },
    {
      "code": 6015,
      "name": "vaultNotEmpty",
      "msg": "Vault is not empty"
    }
  ],
  "types": [
    {
      "name": "pausedChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "paymentExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "spentInWindow",
            "type": "u64"
          },
          {
            "name": "windowLimit",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "policy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "policyId",
            "type": "u64"
          },
          {
            "name": "perTxLimit",
            "type": "u64"
          },
          {
            "name": "windowLimit",
            "type": "u64"
          },
          {
            "name": "windowSeconds",
            "type": "i64"
          },
          {
            "name": "windowStart",
            "type": "i64"
          },
          {
            "name": "spentInWindow",
            "type": "u64"
          },
          {
            "name": "withdrawDelaySeconds",
            "type": "i64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "pendingAmount",
            "type": "u64"
          },
          {
            "name": "pendingUnlockAt",
            "type": "i64"
          },
          {
            "name": "allowedRecipients",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "allowedCount",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "policyInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "recipientAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "withdrawCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "withdrawExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "withdrawRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "policy",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockAt",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "policySeed",
      "type": "bytes",
      "value": "[112, 111, 108, 105, 99, 121]"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
