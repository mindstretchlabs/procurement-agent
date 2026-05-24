import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  sourcingBriefResultSchema,
  type ScoredItem,
  type SourcingBriefResult,
} from "@/lib/analysis/types";

const SOURCING_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    project_title_zh: {
      type: "string",
      description: "Project name/address in Chinese, e.g. '纽瓦克77大学大道 — 采购需求清单'",
    },
    intro_zh: {
      type: "string",
      description:
        "2–3 sentence intro in Chinese explaining this is a sourcing brief for a US multifamily project, listing the categories needed and total item count.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category_zh: { type: "string", description: "Category name in Chinese (e.g. '门', '地板')" },
          mark: { type: ["string", "null"] },
          description_zh: {
            type: "string",
            description: "Item description translated to Chinese, keeping technical terms accurate.",
          },
          quantity: { type: ["number", "null"] },
          unit_zh: { type: ["string", "null"], description: "Unit of measure in Chinese (e.g. '个', '平方英尺')" },
          dimensions_zh: {
            type: ["string", "null"],
            description: "Dimensions as a single string in Chinese (keep original imperial + add metric if helpful).",
          },
          specs_zh: {
            type: "string",
            description:
              "All specs as a readable Chinese paragraph: material, finish, fire rating, core type, wear layer, installation method, etc.",
          },
          certifications_zh: {
            type: "string",
            description:
              "Required certifications listed in Chinese with the original cert codes preserved (e.g. '需要 FloorScore 认证，CARB Phase 2 合规').",
          },
        },
        required: ["category_zh", "mark", "description_zh", "quantity", "unit_zh", "dimensions_zh", "specs_zh", "certifications_zh"],
        additionalProperties: false,
      },
    },
    notes_zh: {
      type: ["string", "null"],
      description: "Any sourcing notes or warnings in Chinese (missing specs, substitution restrictions, etc.).",
    },
  },
  required: ["project_title_zh", "intro_zh", "items", "notes_zh"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are translating a construction material sourcing brief from English to Chinese for Chinese factory partners.

Your audience: Chinese manufacturing and trading company sales reps who will quote against this list. They read Chinese natively and understand construction material terminology in both Chinese and English.

MANDATORY GLOSSARY — use these exact translations. Do NOT use generic machine-translation equivalents:

DOORS:
- solid core → 实心门芯 (NOT 固体核心)
- hollow core → 空心门芯 (NOT 空心核心)
- hollow metal (HM) door → 空心金属门
- fire rating / fire-rated → 防火等级
- 20/45/60/90-minute rated → 20/45/60/90分钟防火等级
- hardware set → 五金套件
- handing / swing direction → 开启方向
- mortise prep → 插芯锁预留
- lockset → 锁具
- door closer → 闭门器
- panic bar / exit device → 推杆锁/逃生推杆
- stile and rail → 边梃门
- undercut → 门底切口
- door frame → 门框
- door leaf → 门扇
- primed → 底漆处理

FLOORING:
- LVT / luxury vinyl tile → LVT豪华乙烯基地板
- LVP / luxury vinyl plank → LVP豪华乙烯基地板
- wear layer → 耐磨层
- click-lock installation → 锁扣式安装
- glue-down installation → 粘贴式安装
- carpet tile → 方块地毯
- solution dyed → 原液染色
- PVC backing → PVC底背
- MDF wallbase / baseboard → MDF踢脚线
- porcelain tile → 瓷质砖/全瓷砖
- ceramic tile → 陶瓷砖
- rectified tile → 整边砖/精修边砖
- tile trim / Schluter profile → 瓷砖收边条/修边条
- anodized aluminum → 阳极氧化铝
- cove base → 阴角条

PLUMBING FIXTURES:
- water closet (WC) → 马桶/坐便器
- faucet → 水龙头
- single-handle faucet → 单把手水龙头
- valve trim → 阀门装饰盖
- diverter → 分水器
- alcove bathtub → 嵌入式浴缸
- undermount sink → 下挂式水槽
- vanity / bathroom vanity → 浴室柜
- vanity top → 台面
- medicine cabinet → 镜柜
- grab bar → 安全扶手
- shower curtain rod → 浴帘杆
- toilet paper holder → 卫生纸架

FRAMING:
- light gauge framing → 轻钢龙骨
- stud → 立柱/竖向龙骨
- track → 天地龙骨
- galvanized steel → 镀锌钢

FINISHES & MATERIALS:
- polished chrome → 抛光铬
- satin finish / brushed → 拉丝面
- stainless steel → 不锈钢
- 304 stainless steel → 304不锈钢
- enameled cast iron → 搪瓷铸铁
- enameled steel → 搪瓷钢板
- acrylic → 亚克力
- Vikrell → Vikrell复合材料

DIMENSIONS & SPECS:
- rough-in → 预埋尺寸
- gauge (metal thickness) → 号 (e.g. 20 GA → 20号)
- ADA compliant → ADA无障碍合规
- rough height/width/length → 粗略高度/宽度/长度

TRADE TERMS (keep in English, add Chinese in parentheses on first use):
- FOB → FOB (离岸价)
- CIF → CIF (到岸价)
- DDP → DDP (完税交货价)
- MOQ → MOQ (最小起订量)

CERTIFICATIONS (always keep the code in original form, add brief Chinese explanation on first use):
- FloorScore → FloorScore (室内空气质量认证)
- CARB Phase 2 → CARB Phase 2 (甲醛释放标准)
- cUPC → cUPC (北美管道认证)
- NSF 61 → NSF 61 (饮用水接触材料安全)
- NSF 372 → NSF 372 (低铅合规)
- UL 10C → UL 10C (正压防火测试)
- NFRC → NFRC (门窗能效认证)
- ANSI/BHMA A156 → ANSI/BHMA A156 (五金性能标准)
- ASTM F1700 → ASTM F1700 (弹性地板标准)
- ISO 13006 → ISO 13006 (瓷砖国际标准)
- CRI Green Label Plus → CRI Green Label Plus (地毯低排放认证)
- EPA WaterSense → EPA WaterSense (节水认证)

Rules:
- Use the glossary terms above. If a term appears in the glossary, you MUST use the listed translation.
- Keep certification codes in their original form with the Chinese explanation in parentheses on first occurrence only.
- Keep type marks (D-01, F-3, WC-1, etc.) unchanged.
- Keep quantities as numbers.
- For dimensions, keep the original imperial measurement and add metric in parentheses.
- For specs, consolidate into a readable Chinese paragraph. Use industry-standard Chinese construction terminology.
- For certifications, list what the US project requires — the factory needs to know what certs to include in their quote.
- Be direct and professional. Write the way a Chinese sourcing agent would write to a factory, not the way a translation app would.
- Items with import_suitability_score < 50 should NOT be included — they'll be sourced locally.`;

export async function generateSourcingBrief(args: {
  items: ScoredItem[];
  fileName: string;
}): Promise<SourcingBriefResult> {
  const { items, fileName } = args;

  const importableItems = items.filter((i) => i.import_suitability_score >= 50);

  if (importableItems.length === 0) {
    return {
      project_title_zh: "采购需求清单",
      intro_zh: "此项目未发现适合进口采购的物料。",
      items: [],
      notes_zh: null,
    };
  }

  const response = await anthropic().messages.create({
    model: MODEL_ID,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: SOURCING_BRIEF_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Translate this sourcing brief into Chinese for our factory partners.

Project file: ${fileName}
Total importable items: ${importableItems.length}

Items to translate (only those scoring ≥50 for import suitability):
${JSON.stringify({ items: importableItems }, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block for sourcing brief");
  }

  return sourcingBriefResultSchema.parse(JSON.parse(textBlock.text));
}
