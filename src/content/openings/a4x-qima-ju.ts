import type { Opening } from "../types";

/** 第七課：起馬局。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "a4x-qima-ju",
  ecco: "A4x",
  title: "起馬局",
  summary:
    "紅方第一步先跳馬，不急著擺炮，保留走中炮或飛相的彈性。黑方常用挺 7 卒回應，限制這個馬。" +
    "本課走紅方之後轉中炮的簡單線。",
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
                          move: "車9平8",
                          note: "黑車平到 8 路準備出動。",
                          children: [
                            {
                              move: "車一平二",
                              note: "紅車出到二路對峙。",
                              children: [
                                {
                                  move: "馬2進3",
                                  note: "黑方跳出另一個馬，形成屏風馬。",
                                  children: [
                                    {
                                      move: "兵七進一",
                                      note: "挺七兵，替七路馬打開前進路線。",
                                      children: [
                                        {
                                          move: "車1平2",
                                          note: "黑方出動另一個車。",
                                          children: [
                                            {
                                              move: "車九平八",
                                              note: "紅方出動另一個車，雙方佈置完成。",
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
