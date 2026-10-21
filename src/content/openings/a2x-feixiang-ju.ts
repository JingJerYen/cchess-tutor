import type { Opening } from "../types";

/** 第四課：飛相局對左中炮。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "a2x-feixiang-ju",
  ecco: "A2x",
  title: "飛相局對左中炮",
  summary:
    "紅方第一步不擺當頭炮，而是飛相補中，先把陣形搭穩，以柔克剛。" +
    "黑方最直接的回應是自己擺中炮（左中炮）搶攻。本課學紅方怎麼穩住，黑方怎麼搶先手。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "相三進五",
      note: "飛相局：先補中相，穩住中路。",
      children: [
        {
          move: "炮8平5",
          note: "黑方擺中炮，直接威脅紅方的中兵。",
          children: [
            {
              move: "馬二進三",
              note: "跳馬保護中兵。",
              children: [
                {
                  move: "馬8進7",
                  note: "黑方跳馬保護中卒。",
                  children: [
                    {
                      move: "車一平二",
                      note: "紅車出到二路。",
                      children: [
                        {
                          move: "車9平8",
                          note: "黑車平到 8 路，和紅車對峙。",
                          children: [
                            {
                              move: "馬八進七",
                              note: "紅方跳出另一個馬。",
                              children: [
                                {
                                  move: "馬2進3",
                                  note: "黑方也跳出另一個馬。",
                                  children: [
                                    {
                                      move: "兵七進一",
                                      note: "挺七兵活馬。",
                                      children: [
                                        {
                                          move: "卒7進1",
                                          note: "黑方挺 7 卒活馬，雙方佈置完成。",
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          move: "炮2平4",
          kind: "alt",
          note: "士角炮：把炮平到士角，穩健的回應。",
        },
        {
          move: "馬8進7",
          kind: "alt",
          note: "先跳馬也可以，雙方都慢慢佈置。",
        },
      ],
    },
  ],
  conclusion: "飛相局的紅方不搶先攻，而是穩穩出子，等黑方的中炮陣形出現弱點再反擊。",
};
