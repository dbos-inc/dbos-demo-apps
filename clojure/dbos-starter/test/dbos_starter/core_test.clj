(ns dbos-starter.core-test
  (:require [clojure.test :refer [deftest is testing]]
            [dbos-starter.core :refer [example-workflow steps-event]])
  (:import [dev.dbos.transact DBOS]
           [dev.dbos.transact.execution ThrowingSupplier]
           [org.mockito ArgumentMatchers InOrder Mockito]))

;; The matchers return nil, so without these hints the verifying .runStep call is resolved by
;; reflection on (nil, nil), which can match any of DBOS's four two-argument runStep overloads.
;; Clojure passes a fn to runStep(ThrowingSupplier, String), so verify that one.
(defn- ^ThrowingSupplier any-supplier []
  (ArgumentMatchers/any))

(defn- ^String eq-name [^String name]
  (ArgumentMatchers/eq name))

(defn- ^DBOS verify-ordered [^InOrder ordered ^DBOS mock]
  (.verify ordered mock))

(deftest example-workflow-test
  (testing "executes all steps in order"
    (let [mock-dbos        (Mockito/mock DBOS)
          _                (example-workflow mock-dbos)
          ^InOrder ordered (Mockito/inOrder (into-array Object [mock-dbos]))]

      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-supplier) (eq-name "stepOne"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 1)))))
      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-supplier) (eq-name "stepTwo"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 2)))))
      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-supplier) (eq-name "stepThree"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 3)))))

      (is (nil? (Mockito/verifyNoMoreInteractions (into-array Object [mock-dbos])))))))
