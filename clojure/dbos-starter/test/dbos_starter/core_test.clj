(ns dbos-starter.core-test
  (:require [clojure.test :refer [deftest is testing]]
            [dbos-starter.core :refer [example-workflow steps-event]])
  (:import [dev.dbos.transact DBOS]
           [dev.dbos.transact.execution ThrowingRunnable]
           [org.mockito ArgumentMatchers InOrder Mockito]))

(defn- ^ThrowingRunnable any-runnable []
  (ArgumentMatchers/any))

(defn- ^DBOS verify-ordered [^InOrder ordered ^DBOS mock]
  (.verify ordered mock))

(deftest example-workflow-test
  (testing "executes all steps in order"
    (let [mock-dbos        (Mockito/mock DBOS)
          _                (example-workflow mock-dbos)
          ^InOrder ordered (Mockito/inOrder (into-array Object [mock-dbos]))]

      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-runnable) (ArgumentMatchers/eq "stepOne"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 1)))))
      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-runnable) (ArgumentMatchers/eq "stepTwo"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 2)))))
      (is (nil? (.runStep  (verify-ordered ordered mock-dbos) (any-runnable) (ArgumentMatchers/eq "stepThree"))))
      (is (nil? (.setEvent (verify-ordered ordered mock-dbos) (ArgumentMatchers/eq steps-event) (ArgumentMatchers/eq (Integer/valueOf 3)))))

      (is (nil? (Mockito/verifyNoMoreInteractions (into-array Object [mock-dbos])))))))
