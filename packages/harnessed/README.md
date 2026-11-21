# @switchyard/harnessed

Model-based tests: `modelTests({ machine, events, states })` gives one test per path through the
machine, each driving the real UI through a [harnessed](https://joegaudet.com/harnessed/) harness
and checking it after every step. Works with any runner harnessed supports.

Guide: **https://joegaudet.com/switchyard/guide/#/testing** · MIT
