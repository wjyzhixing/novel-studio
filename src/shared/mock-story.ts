import type { EntityInput, TimelineEventInput } from './story'

export const LITTLE_COW_CHAPTERS = [
  { filename: '001-小牛第一次看见星星.md', markdown: '# 小牛第一次看见星星\n\n夜里的月亮草原安静得像一片蓝色的海。小牛第一次抬起头，看见一颗星星落在老山羊的角尖上。\n\n“它们不是落下来了，”老山羊说，“它们是在等愿意抬头的人。”小牛把这句话记在心里，决定沿着河谷去找那颗最亮的星。\n' },
  { filename: '002-小牛穿过会发光的草地.md', markdown: '# 小牛穿过会发光的草地\n\n第二天清晨，小牛顺着银色的河谷出发。夜露还没有干，脚下的草一根根亮起来，像有人把星光藏进了叶脉。\n\n风把星铃吹响，牧群在远处回应。小牛虽然有一点害怕，还是一步一步穿过了会发光的草地。\n' },
  { filename: '003-小牛把星星带回家.md', markdown: '# 小牛把星星带回家\n\n草地尽头，一颗小星星卡在月桂树的枝头。小牛没有伸手去抓，只把星铃放在树下，唱起回家的歌。\n\n星星听见歌声，化成一粒温暖的光，落进小牛胸前的铃铛里。从那天起，每当夜色降临，小牛就把光带回牧群，让大家都能找到回家的路。\n' }
] as const

export const LITTLE_COW_ENTITIES: EntityInput[] = [
  { id: 'ent_little_cow', kind: 'character', name: '小牛', aliases: ['小牛仔'], fields: { role: 'protagonist', trait: '好奇、勇敢' }, notes: '第一次看见星星，后来学会把光带回家。' },
  { id: 'ent_old_goat', kind: 'character', name: '老山羊', aliases: ['山羊爷爷'], fields: { role: 'guide' }, notes: '温和的牧群向导，教小牛抬头看星星。' },
  { id: 'ent_moon_meadow', kind: 'place', name: '月亮草原', aliases: ['草原'], fields: { type: 'home' }, notes: '小牛和牧群生活的地方。' },
  { id: 'ent_glow_valley', kind: 'place', name: '发光草地', aliases: ['河谷'], fields: { type: 'journey' }, notes: '夜露会让草叶发出微光。' },
  { id: 'ent_star_bell', kind: 'item', name: '星铃', aliases: ['小铃铛'], fields: { type: 'keepsake' }, notes: '能回应星光，也能帮助牧群找到回家的路。' }
]

export const LITTLE_COW_TIMELINE: TimelineEventInput[] = [
  { id: 'evt_cow_looked_up', title: '小牛第一次看见星星', at: '第一夜', description: '小牛在月亮草原抬头看见星星，决定沿河谷寻找最亮的一颗。', chapterRelPath: 'chapters/001-小牛第一次看见星星.md', entityIds: ['ent_little_cow', 'ent_old_goat', 'ent_moon_meadow'] },
  { id: 'evt_cow_departed', title: '小牛出发穿过河谷', at: '第二天清晨', description: '小牛带着星铃离开牧群，走向发光草地。', chapterRelPath: 'chapters/002-小牛穿过会发光的草地.md', entityIds: ['ent_little_cow', 'ent_star_bell', 'ent_glow_valley'] },
  { id: 'evt_cow_found_star', title: '小牛找到枝头的星星', at: '第二天夜里', description: '小牛用歌声而不是力气，让卡在月桂树上的星星落进星铃。', chapterRelPath: 'chapters/003-小牛把星星带回家.md', entityIds: ['ent_little_cow', 'ent_star_bell'] },
  { id: 'evt_cow_returned', title: '小牛把光带回牧群', at: '第三天清晨', description: '星铃发出温暖的光，照亮了牧群回家的路。', chapterRelPath: 'chapters/003-小牛把星星带回家.md', entityIds: ['ent_little_cow', 'ent_moon_meadow'] }
]
