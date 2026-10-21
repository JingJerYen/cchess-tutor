import type { Opening } from "../types";

/** 第七課：起馬局。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "a4x-qima-ju",
  ecco: "A4x",
  title: "起馬局",
  summary:
    "紅方第一步先跳馬，不急著擺炮，保留走中炮或飛相的彈性。黑方常用挺 7 卒回應，限制這個馬。" +
    "本課走紅方用左炮轉中炮、雙車快速出動的線。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "馬二進三",
      note: "起馬局：先跳馬，保留佈局彈性。",
      children: [
        {
          move: "卒7進1",
          note: "黑方挺 7 卒，頂住紅方三路馬的前進路線。",
          children: [
            {
              move: "炮八平五",
              note: "紅方用左邊的炮轉成當頭炮（右炮被自己的馬擋住，平不過去）。",
              children: [
                {
                  move: "馬8進7",
                  note: "黑方跳馬保護中卒。",
                  children: [
                    {
                      move: "馬八進七",
                      note: "紅方跳出左馬，保護中兵並替左車讓路。",
                      children: [
                        {
                          move: "馬2進3",
                          note: "黑方跳出另一個馬，形成屏風馬。",
                          children: [
                            {
                              move: "車九平八",
                              note: "紅方左車出到八路。",
                              children: [
                                {
                                  move: "車1平2",
                                  note: "黑車平到 2 路和紅車對峙。",
                                  children: [
                                    {
                                      move: "車八進四",
                                      note: "巡河車：紅車進到河口。",
                                      children: [
                                        {
                                          move: "士6進5",
                                          note: "黑方補士，雙方基本佈置完成。",
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
                          move: "炮2平3",
                          kind: "alt",
                          note: "炮平到 3 路，準備對頂紅方的七兵，也是常見走法。",
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
          move: "馬8進7",
          kind: "alt",
          note: "黑方也跳馬，雙方都慢慢佈置。",
        },
        {
          move: "炮8平5",
          kind: "alt",
          note: "黑方搶先擺中炮，紅方要先保護中兵。",
        },
      ],
    },
  ],
  conclusion: "起馬局常常會轉回中炮對屏風馬的局面，只是著法順序不同；第一課學到的原則在這裡都用得上。",
};
