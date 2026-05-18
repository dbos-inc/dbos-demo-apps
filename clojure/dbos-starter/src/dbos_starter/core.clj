(ns dbos-starter.core
  (:require
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [reitit.ring :as ring]
   [ring.adapter.jetty :as jetty])
  (:import
   [dev.dbos.transact DBOS StartWorkflowOptions]
   [dev.dbos.transact.config DBOSConfig]
   [java.time Duration])
  (:gen-class))

(def ^:const steps-event "steps_event")

(defn- step-one []
  (Thread/sleep 5000)
  (log/infof "Workflow %s step 1 completed!" (DBOS/workflowId)))

(defn- step-two []
  (Thread/sleep 5000)
  (log/infof "Workflow %s step 2 completed!" (DBOS/workflowId)))

(defn- step-three []
  (Thread/sleep 5000)
  (log/infof "Workflow %s step 3 completed!" (DBOS/workflowId)))

(defn example-workflow [^DBOS dbos]
  (.runStep dbos step-one "stepOne")
  (.setEvent dbos steps-event (Integer/valueOf 1))
  (.runStep dbos step-two "stepTwo")
  (.setEvent dbos steps-event (Integer/valueOf 2))
  (.runStep dbos step-three "stepThree")
  (.setEvent dbos steps-event (Integer/valueOf 3)))

;; Note, this version of register workflow works with DBOS transact 0.9.0-m3
;; and uses the updated DBOSIntegration API that a) doesn't need to construct a
;; @Workflow annotation and b) returns the registered workflow instance needed
;; by startRegisteredWorkflow

(defn register-workflow
  "Registers a Clojure fn as a named DBOS workflow (must be called before launch).
   arity is the number of runtime args the workflow fn accepts (not counting any
   closed-over dependencies). Returns a fn [task-id & args] that starts the workflow
   via startRegisteredWorkflow and blocks on getResult."
  [^DBOS dbos workflow-name f arity]
  (let [param-types (into-array Class (repeat arity Object))
        ifn-invoke  (.getMethod clojure.lang.IFn "invoke" param-types)
        class-name  (.getName (.getClass f))
        reg-wf      (.registerWorkflow (.integration dbos) workflow-name class-name nil f ifn-invoke nil nil)]
    (fn [task-id & args]
      (.getResult (.startRegisteredWorkflow (.integration dbos)
                                            reg-wf
                                            (object-array args)
                                            (StartWorkflowOptions. task-id))))))

(defn- make-app [^DBOS dbos start-workflow]
  (ring/ring-handler
   (ring/router
    [["/" {:get (fn [_]
                  {:status  200
                   :headers {"Content-Type" "text/html"}
                   :body    (io/input-stream (io/resource "index.html"))})}]
     ["/workflow/:task-id"
      {:get (fn [{:keys [path-params]}]
              (let [task-id (:task-id path-params)]
                (future (start-workflow task-id))
                {:status 200 :body ""}))}]
     ["/last_step/:task-id"
      {:get (fn [{:keys [path-params]}]
              (let [task-id (:task-id path-params)
                    step    (-> (.getEvent dbos task-id steps-event (Duration/ofSeconds 0))
                                (.orElse (Integer/valueOf 0)))]
                {:status 200 :body (str step)}))}]
     ["/crash"
      {:post (fn [_]
               (log/warn "Crash endpoint called - terminating application")
               (.. Runtime getRuntime (halt 0))
               {:status 200 :body ""})}]])
   (ring/create-default-handler)))

(defn -main [& _]
  (let [db-url  (or (System/getenv "DBOS_SYSTEM_JDBC_URL")
                    "jdbc:postgresql://localhost:5432/dbos_starter_clojure")
        db-user (or (System/getenv "PGUSER") "postgres")
        db-pass (or (System/getenv "PGPASSWORD") "dbos")
        config  (-> (DBOSConfig/defaults "dbos-starter-clojure")
                    (.withDatabaseUrl db-url)
                    (.withDbUser db-user)
                    (.withDbPassword db-pass)
                    (.withAppVersion "0.1.0"))
        dbos           (DBOS. config)
        start-workflow (register-workflow dbos "exampleWorkflow" #(example-workflow dbos) 0)]
    (.launch dbos)
    (.addShutdownHook (Runtime/getRuntime) (Thread. #(.shutdown dbos)))
    (log/info "Server starting on http://localhost:7070")
    (jetty/run-jetty (make-app dbos start-workflow) {:port 7070 :join? true})))
