// The MIT License (MIT)
//
// Copyright (c) 2020 The Prometheus Authors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { buildVectorMatching, ValueType, VectorMatchCardinality } from './type';
import { createEditorState } from '../../test/utils';
import { walkThrough } from './path-finder';
import { BinaryExpr } from 'lezer-promql';
import chai from 'chai';

describe('buildVectorMatching test', () => {
  const testCases = [
    {
      binaryExpr: 'foo * bar',
      expectedVectorMatching: { card: VectorMatchCardinality.CardOneToOne, matchingLabels: [], on: false, include: [] },
    },
    {
      binaryExpr: 'foo * sum',
      expectedVectorMatching: { card: VectorMatchCardinality.CardOneToOne, matchingLabels: [], on: false, include: [] },
    },
    {
      binaryExpr: 'foo == 1',
      expectedVectorMatching: { card: VectorMatchCardinality.CardOneToOne, matchingLabels: [], on: false, include: [] },
    },
    {
      binaryExpr: 'foo == bool 1',
      expectedVectorMatching: { card: VectorMatchCardinality.CardOneToOne, matchingLabels: [], on: false, include: [] },
    },
    {
      binaryExpr: '2.5 / bar',
      expectedVectorMatching: { card: VectorMatchCardinality.CardOneToOne, matchingLabels: [], on: false, include: [] },
    },
    {
      binaryExpr: 'foo and bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      binaryExpr: 'foo or bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      binaryExpr: 'foo unless bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      // Test and/or precedence and reassigning of operands.
      // Here it will test only the first VectorMatching so (a + b) or (c and d) ==> ManyToMany
      binaryExpr: 'foo + bar or bla and blub',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      // Test and/or/unless precedence.
      // Here it will test only the first VectorMatching so ((a and b) unless c) or d ==> ManyToMany
      binaryExpr: 'foo and bar unless baz or qux',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      binaryExpr: 'foo * on(test,blub) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardOneToOne,
        matchingLabels: ['test', 'blub'],
        on: true,
        include: [],
      },
    },
    {
      binaryExpr: 'foo * on(test,blub) group_left bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToOne,
        matchingLabels: ['test', 'blub'],
        on: true,
        include: [],
      },
    },
    {
      binaryExpr: 'foo and on(test,blub) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: ['test', 'blub'],
        on: true,
        include: [],
      },
    },
    {
      binaryExpr: 'foo and on() bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: true,
        include: [],
      },
    },
    {
      binaryExpr: 'foo and ignoring(test,blub) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: ['test', 'blub'],
        on: false,
        include: [],
      },
    },
    {
      binaryExpr: 'foo and ignoring() bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: [],
        on: false,
        include: [],
      },
    },
    {
      binaryExpr: 'foo unless on(bar) baz',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToMany,
        matchingLabels: ['bar'],
        on: true,
        include: [],
      },
    },
    {
      binaryExpr: 'foo / on(test,blub) group_left(bar) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToOne,
        matchingLabels: ['test', 'blub'],
        on: true,
        include: ['bar'],
      },
    },
    {
      binaryExpr: 'foo / ignoring(test,blub) group_left(blub) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToOne,
        matchingLabels: ['test', 'blub'],
        on: false,
        include: ['blub'],
      },
    },
    {
      binaryExpr: 'foo / ignoring(test,blub) group_left(bar) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardManyToOne,
        matchingLabels: ['test', 'blub'],
        on: false,
        include: ['bar'],
      },
    },
    {
      binaryExpr: 'foo - on(test,blub) group_right(bar,foo) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardOneToMany,
        matchingLabels: ['test', 'blub'],
        on: true,
        include: ['bar', 'foo'],
      },
    },
    {
      binaryExpr: 'foo - ignoring(test,blub) group_right(bar,foo) bar',
      expectedVectorMatching: {
        card: VectorMatchCardinality.CardOneToMany,
        matchingLabels: ['test', 'blub'],
        on: false,
        include: ['bar', 'foo'],
      },
    },
  ];
  testCases.forEach((value) => {
    it(value.binaryExpr, () => {
      const state = createEditorState(value.binaryExpr);
      const node = walkThrough(state.tree.firstChild ? state.tree.firstChild : state.tree, BinaryExpr);
      chai.expect(node).to.not.null;
      chai.expect(node).to.not.undefined;
      if (node) {
        chai.expect(value.expectedVectorMatching).to.deep.equal(buildVectorMatching(state, node));
      }
    });
  });
});