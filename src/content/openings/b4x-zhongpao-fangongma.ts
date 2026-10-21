import type { Opening } from "../types";

/** 第三課：中炮對反宮馬。【手寫草稿，待產線講解取代】 */
export const opening: Opening = {
  id: "b4x-zhongpao-fangongma",
  ecco: "B4x",
  title: "中炮對反宮馬",
  summary:
    "面對當頭炮，黑方先跳一個馬，再把另一邊的炮平到士角（炮8平6），兩個馬中間夾著一門炮，" +
    "叫「反宮馬」，又叫「夾炮屏風」。比屏風馬更有彈性，是現代最流行的防守之一。",
  learnerSide: "r",
  verified: false,
  source: "手寫草稿，依一般開局常識整理；待離線產線驗證後取代。",
  root: [
    {
      move: "炮二平五",
      note: "當頭炮。",
      children: [
        {
          move: "馬2進3",
          note: "先跳右馬保護中卒。",
          children: [
            {
              move: "馬二進三",
              note: "紅方跳馬保護中兵。",
              children: [
                {
                  move: "炮8平6",
                  note: "炮平到士角，形成反宮馬。",
                  children: [
                    {
                      move: "車一平二",
                      note: "紅車出到二路。",
                      children: [
                        {
                          move: "馬8進7",
                          note: "跳出另一個馬，反宮馬陣形完成。",
                          children: [
                            {
                              move: "兵三進一",
                              note: "挺三兵，替三路馬開路，也準備壓制黑方的 7 路馬。",
                              children: [
                                {
                                  move: "卒3進1",
                                  note: "黑方挺 3 卒活馬。",
                                  children: [
                                    {
                                      move: "馬八進九",
                                      note: "紅方左馬跳到邊上，讓出七路給炮。",
                                      children: [
                                        {
                                          move: "象7進5",
                                          note: "黑方飛象補中。",
                                          children: [
                                            {
                                              move: "炮八平七",
                                              note: "紅炮平到七路，瞄著黑方的 3 路。",
                                              children: [
                                                {
                                                  move: "車1平2",
                                                  note: "黑方出車。",
                                                  children: [
                                                    {
                                                      move: "車九平八",
                                                      note: "紅方出車，雙方佈置完成。",
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
                              move: "兵七進一",
                              kind: "alt",
                              note: "挺七兵也很常見，之後走五七炮或五六炮對反宮馬。",
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
                  note: "屏風馬，見第一課。",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  conclusion: "反宮馬的士角炮同時防守和牽制紅方的三路馬，紅方通常用進三兵和七路炮來施壓。",
};
